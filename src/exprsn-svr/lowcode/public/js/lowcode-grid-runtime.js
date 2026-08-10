/**
 * ═══════════════════════════════════════════════════════════
 * Grid Runtime Engine
 * Powers data grid rendering with sorting, filtering, and pagination
 * ═══════════════════════════════════════════════════════════
 */

class GridRuntimeEngine {
  constructor(gridDefinition, options = {}) {
    this.gridDefinition = gridDefinition;
    this.options = {
      containerId: options.containerId || 'gridContainer',
      autoLoad: options.autoLoad !== false,
      pageSize: gridDefinition.pagination?.pageSize || 25,
      enableFiltering: options.enableFiltering !== false,
      enableSorting: options.enableSorting !== false,
      enablePagination: gridDefinition.pagination?.enabled !== false,
      onRowClick: options.onRowClick || null,
      onRowEdit: options.onRowEdit || null,
      onRowDelete: options.onRowDelete || null,
      ...options
    };

    // Runtime state
    this.state = {
      // Data
      rows: [],
      totalRows: 0,
      selectedRows: new Set(),

      // Pagination
      currentPage: 1,
      pageSize: this.options.pageSize,
      totalPages: 0,

      // Sorting
      sortColumn: null,
      sortDirection: 'asc', // 'asc' or 'desc'

      // Filtering
      filters: {},
      activeFilters: [],

      // Loading states
      loading: {
        initial: false,
        data: false,
        action: false
      },

      // Error state
      error: null
    };

    // Event emitter pattern
    this.listeners = {};

    console.log('[GridRuntime] Initialized:', {
      gridId: gridDefinition.id,
      gridName: gridDefinition.name,
      columns: gridDefinition.columns?.length || 0
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * INITIALIZATION
   * ═══════════════════════════════════════════════════════════
   */

  async initialize() {
    try {
      console.log('[GridRuntime] Initializing grid...');

      this.state.loading.initial = true;
      this.emit('initializing');

      // Validate grid definition
      this.validateGridDefinition();

      // Render initial UI
      this.render();

      // Load data if autoLoad is enabled
      if (this.options.autoLoad) {
        await this.loadData();
      }

      this.state.loading.initial = false;
      this.emit('initialized');

      console.log('[GridRuntime] Initialization complete');
      return true;

    } catch (error) {
      console.error('[GridRuntime] Initialization failed:', error);
      this.state.loading.initial = false;
      this.state.error = error.message;
      this.emit('error', error);
      this.renderError(error);
      throw error;
    }
  }

  validateGridDefinition() {
    if (!this.gridDefinition.columns || this.gridDefinition.columns.length === 0) {
      throw new Error('Grid must have at least one column');
    }

    if (!this.gridDefinition.dataSource) {
      throw new Error('Grid must have a data source');
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * DATA LOADING
   * ═══════════════════════════════════════════════════════════
   */

  async loadData(page = 1) {
    try {
      this.state.loading.data = true;
      this.state.currentPage = page;
      this.emit('loadingData');

      console.log('[GridRuntime] Loading data:', {
        page,
        pageSize: this.state.pageSize,
        filters: this.state.activeFilters,
        sort: this.state.sortColumn
      });

      // Build query parameters
      const queryParams = this.buildQueryParams();

      // Fetch data from data source
      const response = await fetch(
        `/lowcode/api/runtime/${window.APP_ID}/data/${this.gridDefinition.dataSource.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'list',
            filters: queryParams.filters,
            options: {
              limit: this.state.pageSize,
              offset: (page - 1) * this.state.pageSize,
              orderBy: queryParams.orderBy
            }
          })
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load grid data');
      }

      // Update state with loaded data
      this.state.rows = Array.isArray(result.data) ? result.data : result.data.rows || [];
      this.state.totalRows = result.data.total || result.data.count || this.state.rows.length;
      this.state.totalPages = Math.ceil(this.state.totalRows / this.state.pageSize);

      console.log('[GridRuntime] Data loaded:', {
        rows: this.state.rows.length,
        total: this.state.totalRows,
        pages: this.state.totalPages
      });

      this.state.loading.data = false;
      this.emit('dataLoaded', { rows: this.state.rows, total: this.state.totalRows });

      // Re-render table with new data
      this.renderTable();

    } catch (error) {
      console.error('[GridRuntime] Data loading failed:', error);
      this.state.loading.data = false;
      this.state.error = error.message;
      this.emit('error', { type: 'loadData', error });
      this.renderError(error);
    }
  }

  buildQueryParams() {
    const params = {
      filters: {},
      orderBy: null
    };

    // Apply active filters
    this.state.activeFilters.forEach(filter => {
      params.filters[filter.field] = filter.value;
    });

    // Apply sorting
    if (this.state.sortColumn) {
      params.orderBy = {
        field: this.state.sortColumn,
        direction: this.state.sortDirection.toUpperCase()
      };
    }

    return params;
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * RENDERING
   * ═══════════════════════════════════════════════════════════
   */

  render() {
    const container = document.getElementById(this.options.containerId);
    if (!container) {
      throw new Error(`Container with ID '${this.options.containerId}' not found`);
    }

    container.innerHTML = `
      <div class="grid-runtime-container">
        <!-- Grid Header -->
        <div class="grid-header">
          <div class="grid-title-section">
            <h3 class="grid-title">${this.escapeHtml(this.gridDefinition.displayName)}</h3>
            ${this.gridDefinition.description ? `
              <p class="grid-description">${this.escapeHtml(this.gridDefinition.description)}</p>
            ` : ''}
          </div>
          <div class="grid-actions">
            ${this.renderHeaderActions()}
          </div>
        </div>

        <!-- Filter Bar (if enabled) -->
        ${this.options.enableFiltering ? `
          <div class="grid-filter-bar" id="gridFilterBar">
            ${this.renderFilters()}
          </div>
        ` : ''}

        <!-- Grid Table -->
        <div class="grid-table-wrapper" id="gridTableWrapper">
          ${this.state.loading.initial ? this.renderLoadingState() : ''}
        </div>

        <!-- Pagination (if enabled) -->
        ${this.options.enablePagination ? `
          <div class="grid-pagination" id="gridPagination">
            ${this.renderPagination()}
          </div>
        ` : ''}
      </div>
    `;

    // Attach event listeners
    this.attachEventListeners();
  }

  renderHeaderActions() {
    const actions = this.gridDefinition.actions || [];

    return `
      <div class="grid-header-actions">
        <button class="btn btn-sm btn-secondary" onclick="window.gridRuntime.refresh()">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
        ${actions.filter(a => a.position === 'header').map(action => `
          <button class="btn btn-sm btn-${action.style || 'primary'}"
                  onclick="window.gridRuntime.executeAction('${action.id}')">
            ${action.icon ? `<i class="${action.icon}"></i>` : ''} ${this.escapeHtml(action.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  renderFilters() {
    // Render filter controls based on column types
    return `
      <div class="filter-controls">
        <input type="search"
               class="form-control form-control-sm"
               placeholder="Search..."
               id="gridSearchInput"
               style="max-width: 300px;">
        <button class="btn btn-sm btn-secondary" onclick="window.gridRuntime.clearFilters()">
          <i class="fas fa-times"></i> Clear Filters
        </button>
      </div>
    `;
  }

  renderTable() {
    const wrapper = document.getElementById('gridTableWrapper');
    if (!wrapper) return;

    if (this.state.loading.data) {
      wrapper.innerHTML = this.renderLoadingState();
      return;
    }

    if (this.state.rows.length === 0) {
      wrapper.innerHTML = this.renderEmptyState();
      return;
    }

    wrapper.innerHTML = `
      <table class="table table-hover table-striped">
        <thead>
          <tr>
            ${this.gridDefinition.columns.map(column => this.renderColumnHeader(column)).join('')}
            ${this.hasRowActions() ? '<th class="grid-actions-column">Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${this.state.rows.map((row, index) => this.renderRow(row, index)).join('')}
        </tbody>
      </table>
    `;

    // Re-attach event listeners for the table
    this.attachTableEventListeners();
  }

  renderColumnHeader(column) {
    const isSortable = this.options.enableSorting && column.sortable !== false;
    const isSorted = this.state.sortColumn === column.field;
    const sortIcon = isSorted
      ? (this.state.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down')
      : 'fa-sort';

    return `
      <th class="${isSortable ? 'sortable' : ''}"
          ${isSortable ? `data-field="${column.field}"` : ''}
          style="${column.width ? `width: ${column.width};` : ''}">
        <div class="column-header">
          <span>${this.escapeHtml(column.label || column.name)}</span>
          ${isSortable ? `<i class="fas ${sortIcon} sort-icon"></i>` : ''}
        </div>
      </th>
    `;
  }

  renderRow(row, index) {
    const rowId = row.id || index;

    return `
      <tr data-row-id="${rowId}" data-row-index="${index}">
        ${this.gridDefinition.columns.map(column => this.renderCell(row, column)).join('')}
        ${this.hasRowActions() ? `
          <td class="grid-actions-cell">
            ${this.renderRowActions(row, index)}
          </td>
        ` : ''}
      </tr>
    `;
  }

  renderCell(row, column) {
    const value = this.getNestedValue(row, column.field);
    const formattedValue = this.formatCellValue(value, column);

    return `
      <td data-field="${column.field}">
        ${formattedValue}
      </td>
    `;
  }

  formatCellValue(value, column) {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return '<span class="text-muted">—</span>';
    }

    // Apply column-specific formatting
    switch (column.type) {
      case 'date':
        return this.formatDate(value);

      case 'datetime':
        return this.formatDateTime(value);

      case 'boolean':
        return value
          ? '<i class="fas fa-check text-success"></i>'
          : '<i class="fas fa-times text-danger"></i>';

      case 'number':
        return this.formatNumber(value, column.format);

      case 'currency':
        return this.formatCurrency(value, column.currency || 'USD');

      case 'link':
        return `<a href="${this.escapeHtml(value)}" target="_blank">${this.escapeHtml(value)}</a>`;

      case 'email':
        return `<a href="mailto:${this.escapeHtml(value)}">${this.escapeHtml(value)}</a>`;

      case 'image':
        return `<img src="${this.escapeHtml(value)}" alt="" style="max-width: 50px; max-height: 50px;">`;

      default:
        return this.escapeHtml(String(value));
    }
  }

  renderRowActions(row, index) {
    const actions = this.gridDefinition.actions?.filter(a => a.position === 'row' || !a.position) || [];
    const defaultActions = [];

    // Add default view/edit/delete actions if not custom actions defined
    if (actions.length === 0) {
      if (this.options.onRowEdit) {
        defaultActions.push({
          id: 'edit',
          label: 'Edit',
          icon: 'fas fa-edit',
          style: 'primary'
        });
      }
      if (this.options.onRowDelete) {
        defaultActions.push({
          id: 'delete',
          label: 'Delete',
          icon: 'fas fa-trash',
          style: 'danger'
        });
      }
    }

    const allActions = [...actions, ...defaultActions];

    return `
      <div class="btn-group btn-group-sm" role="group">
        ${allActions.map(action => `
          <button class="btn btn-${action.style || 'secondary'}"
                  data-action="${action.id}"
                  data-row-id="${row.id || index}"
                  title="${this.escapeHtml(action.label)}">
            ${action.icon ? `<i class="${action.icon}"></i>` : this.escapeHtml(action.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  hasRowActions() {
    return (this.gridDefinition.actions && this.gridDefinition.actions.length > 0) ||
           this.options.onRowEdit ||
           this.options.onRowDelete;
  }

  renderPagination() {
    if (this.state.totalPages <= 1) {
      return '';
    }

    const currentPage = this.state.currentPage;
    const totalPages = this.state.totalPages;
    const maxVisible = 5;

    // Calculate page range to display
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return `
      <div class="pagination-wrapper">
        <div class="pagination-info">
          Showing ${(currentPage - 1) * this.state.pageSize + 1} to
          ${Math.min(currentPage * this.state.pageSize, this.state.totalRows)} of
          ${this.state.totalRows} rows
        </div>
        <nav>
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="1">First</a>
            </li>
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
            </li>
            ${pages.map(page => `
              <li class="page-item ${page === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${page}">${page}</a>
              </li>
            `).join('')}
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
            </li>
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
              <a class="page-link" href="#" data-page="${totalPages}">Last</a>
            </li>
          </ul>
        </nav>
      </div>
    `;
  }

  renderLoadingState() {
    return `
      <div class="grid-loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading data...</p>
      </div>
    `;
  }

  renderEmptyState() {
    return `
      <div class="grid-empty">
        <i class="fas fa-table fa-3x text-muted mb-3"></i>
        <p class="text-muted">No data to display</p>
      </div>
    `;
  }

  renderError(error) {
    const wrapper = document.getElementById('gridTableWrapper');
    if (!wrapper) return;

    wrapper.innerHTML = `
      <div class="grid-error">
        <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
        <h5>Error Loading Grid</h5>
        <p class="text-muted">${this.escapeHtml(error.message)}</p>
        <button class="btn btn-primary" onclick="window.gridRuntime.refresh()">
          <i class="fas fa-sync-alt"></i> Retry
        </button>
      </div>
    `;
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * EVENT HANDLING
   * ═══════════════════════════════════════════════════════════
   */

  attachEventListeners() {
    // Search input
    const searchInput = document.getElementById('gridSearchInput');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.applySearchFilter(e.target.value);
        }, 300);
      });
    }
  }

  attachTableEventListeners() {
    // Sort column headers
    if (this.options.enableSorting) {
      document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => {
          const field = header.dataset.field;
          this.toggleSort(field);
        });
      });
    }

    // Row actions
    document.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.dataset.action;
        const rowId = button.dataset.rowId;
        this.handleRowAction(action, rowId);
      });
    });

    // Row click
    if (this.options.onRowClick) {
      document.querySelectorAll('tr[data-row-id]').forEach(row => {
        row.addEventListener('click', () => {
          const rowId = row.dataset.rowId;
          const rowIndex = parseInt(row.dataset.rowIndex);
          const rowData = this.state.rows[rowIndex];
          this.options.onRowClick(rowData, rowId);
        });
      });
    }

    // Pagination
    if (this.options.enablePagination) {
      document.querySelectorAll('.pagination a').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const page = parseInt(link.dataset.page);
          if (page && page !== this.state.currentPage) {
            this.loadData(page);
          }
        });
      });
    }
  }

  async handleRowAction(actionId, rowId) {
    const rowIndex = this.state.rows.findIndex(r => String(r.id) === String(rowId));
    const rowData = this.state.rows[rowIndex];

    console.log('[GridRuntime] Row action:', { actionId, rowId, rowData });

    switch (actionId) {
      case 'edit':
        if (this.options.onRowEdit) {
          this.options.onRowEdit(rowData, rowId);
        }
        break;

      case 'delete':
        if (this.options.onRowDelete) {
          if (confirm('Are you sure you want to delete this record?')) {
            await this.options.onRowDelete(rowData, rowId);
            await this.refresh();
          }
        }
        break;

      default:
        this.emit('rowAction', { action: actionId, row: rowData, rowId });
        break;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * SORTING & FILTERING
   * ═══════════════════════════════════════════════════════════
   */

  toggleSort(field) {
    if (this.state.sortColumn === field) {
      // Toggle direction
      this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New sort column
      this.state.sortColumn = field;
      this.state.sortDirection = 'asc';
    }

    console.log('[GridRuntime] Sort changed:', {
      column: this.state.sortColumn,
      direction: this.state.sortDirection
    });

    this.loadData(1); // Reset to first page when sorting changes
  }

  applySearchFilter(searchTerm) {
    console.log('[GridRuntime] Search filter:', searchTerm);

    if (!searchTerm || searchTerm.trim() === '') {
      this.state.activeFilters = [];
    } else {
      // Apply search across all text columns
      this.state.activeFilters = [{
        type: 'search',
        value: searchTerm.trim()
      }];
    }

    this.loadData(1); // Reset to first page when filter changes
  }

  clearFilters() {
    this.state.activeFilters = [];
    const searchInput = document.getElementById('gridSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
    this.loadData(1);
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * PUBLIC API
   * ═══════════════════════════════════════════════════════════
   */

  async refresh() {
    console.log('[GridRuntime] Refreshing grid...');
    await this.loadData(this.state.currentPage);
  }

  getSelectedRows() {
    return Array.from(this.state.selectedRows).map(id =>
      this.state.rows.find(r => r.id === id)
    );
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * UTILITY METHODS
   * ═══════════════════════════════════════════════════════════
   */

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(value) {
    const date = new Date(value);
    return date.toLocaleDateString();
  }

  formatDateTime(value) {
    const date = new Date(value);
    return date.toLocaleString();
  }

  formatNumber(value, format) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return format ? num.toFixed(format.decimals || 2) : num.toString();
  }

  formatCurrency(value, currency) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(num);
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * EVENT EMITTER
   * ═══════════════════════════════════════════════════════════
   */

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GridRuntimeEngine;
}
