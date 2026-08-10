/**
 * ═══════════════════════════════════════════════════════════
 * Visual Schema Designer
 * Drag-and-drop database schema builder with D3.js
 * ═══════════════════════════════════════════════════════════
 */

const schemaDesigner = {
  // State
  schemaId: null,
  schema: null,
  tables: [],
  relationships: [],
  selectedTable: null,
  currentTable: null,

  // D3 Elements
  svg: null,
  g: null,
  zoom: null,

  // Modals
  addTableModal: null,
  editTableModal: null,
  addColumnModal: null,

  /**
   * Initialize the schema designer
   */
  init(schemaId) {
    this.schemaId = schemaId;

    // Initialize Bootstrap modals
    this.addTableModal = new bootstrap.Modal(document.getElementById('addTableModal'));
    this.editTableModal = new bootstrap.Modal(document.getElementById('editTableModal'));
    this.addColumnModal = new bootstrap.Modal(document.getElementById('addColumnModal'));

    // Setup D3 canvas
    this.setupCanvas();

    // Load schema data
    this.loadSchema();

    // Setup auto-save
    this.setupAutoSave();
  },

  /**
   * Setup D3.js SVG canvas with zoom and pan
   */
  setupCanvas() {
    this.svg = d3.select('#schema-canvas');
    this.g = d3.select('#canvas-root');

    // Get canvas dimensions
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.svg.attr('width', width).attr('height', height);

    // Setup zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
        this.updateMinimap();
      });

    this.svg.call(this.zoom);

    // Handle window resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.svg.attr('width', w).attr('height', h);
    });
  },

  /**
   * Load schema from API
   */
  async loadSchema() {
    try {
      const response = await fetch(`/forge/schema-designer/${this.schemaId}`);
      const result = await response.json();

      if (result.success) {
        this.schema = result.data;
        this.tables = result.data.tables || [];
        this.relationships = result.data.relationships || [];

        // Update UI
        this.updateSchemaInfo();
        this.renderSchema();
        this.updateSidebar();
      } else {
        this.showError('Failed to load schema');
      }
    } catch (error) {
      console.error('Error loading schema:', error);
      this.showError('Error loading schema: ' + error.message);
    }
  },

  /**
   * Update schema info in toolbar and sidebar
   */
  updateSchemaInfo() {
    document.getElementById('schema-name').textContent = this.schema.name;
    document.getElementById('schema-database').textContent = this.schema.databaseName || 'Not specified';
    document.getElementById('schema-status-badge').textContent = this.schema.status.toUpperCase();
    document.getElementById('tables-count').textContent = this.tables.length;
    document.getElementById('relationships-count').textContent = this.relationships.length;

    // Update status badge color
    const badge = document.getElementById('schema-status-badge');
    badge.className = 'info-badge';
    if (this.schema.status === 'active') {
      badge.style.background = '#d4edda';
      badge.style.color = '#155724';
    } else if (this.schema.status === 'draft') {
      badge.style.background = '#e7f1ff';
      badge.style.color = '#0d6efd';
    }
  },

  /**
   * Render entire schema on canvas
   */
  renderSchema() {
    // Clear existing
    d3.select('#tables-layer').selectAll('*').remove();
    d3.select('#relationships-layer').selectAll('*').remove();

    // Render relationships first (bottom layer)
    this.renderRelationships();

    // Render tables
    this.renderTables();

    // Update minimap
    this.updateMinimap();
  },

  /**
   * Render all tables on canvas
   */
  renderTables() {
    const self = this;
    const tablesLayer = d3.select('#tables-layer');

    // Bind data
    const tableGroups = tablesLayer.selectAll('.schema-table')
      .data(this.tables, d => d.id);

    // Remove old tables
    tableGroups.exit().remove();

    // Add new tables
    const newTables = tableGroups.enter()
      .append('g')
      .attr('class', 'schema-table')
      .attr('data-table-id', d => d.id)
      .attr('transform', d => `translate(${d.positionX || 100}, ${d.positionY || 100})`)
      .call(d3.drag()
        .on('start', function(event, d) {
          d3.select(this).raise();
          self.selectedTable = d;
        })
        .on('drag', function(event, d) {
          d.positionX = event.x;
          d.positionY = event.y;
          d3.select(this).attr('transform', `translate(${event.x}, ${event.y})`);
          self.renderRelationships();
        })
        .on('end', function(event, d) {
          self.saveTablePosition(d);
        })
      )
      .on('click', function(event, d) {
        event.stopPropagation();
        self.selectTable(d);
      })
      .on('dblclick', function(event, d) {
        event.stopPropagation();
        self.editTable(d);
      });

    // Merge new and existing
    const allTables = newTables.merge(tableGroups);

    // Draw each table
    allTables.each(function(tableData) {
      const tableGroup = d3.select(this);
      tableGroup.selectAll('*').remove();

      const columns = tableData.columns || [];
      const tableWidth = 250;
      const headerHeight = 40;
      const columnHeight = 25;
      const totalHeight = headerHeight + (columns.length * columnHeight) + 10;

      // Table body background
      tableGroup.append('rect')
        .attr('class', 'table-body')
        .attr('width', tableWidth)
        .attr('height', totalHeight)
        .attr('fill', 'white')
        .attr('stroke', tableData.color || '#667eea')
        .attr('stroke-width', 2);

      // Header background
      tableGroup.append('rect')
        .attr('class', 'table-header')
        .attr('width', tableWidth)
        .attr('height', headerHeight)
        .attr('fill', tableData.color || '#667eea');

      // Table icon
      tableGroup.append('text')
        .attr('x', 15)
        .attr('y', 27)
        .attr('class', 'table-title')
        .attr('fill', 'white')
        .attr('font-size', 18)
        .text('⬜');

      // Table name
      tableGroup.append('text')
        .attr('x', tableWidth / 2)
        .attr('y', 27)
        .attr('class', 'table-title')
        .text(tableData.displayName || tableData.name);

      // Columns
      columns.forEach((col, i) => {
        const y = headerHeight + (i * columnHeight) + 18;

        // Column icon
        let icon = '○';
        if (col.isPrimaryKey) icon = '🔑';
        else if (col.isUnique) icon = '⭐';

        tableGroup.append('text')
          .attr('x', 10)
          .attr('y', y)
          .attr('class', 'table-column-icon')
          .text(icon);

        // Column name
        const colClass = col.isPrimaryKey ? 'table-column primary-key' : 'table-column';
        tableGroup.append('text')
          .attr('x', 30)
          .attr('y', y)
          .attr('class', colClass)
          .text(col.name);

        // Data type
        tableGroup.append('text')
          .attr('x', tableWidth - 10)
          .attr('y', y)
          .attr('class', 'table-column-icon')
          .attr('text-anchor', 'end')
          .text(col.dataType);
      });
    });
  },

  /**
   * Render relationship lines
   */
  renderRelationships() {
    const self = this;
    const relationshipsLayer = d3.select('#relationships-layer');

    // Clear existing
    relationshipsLayer.selectAll('*').remove();

    // Draw each relationship
    this.relationships.forEach(rel => {
      const sourceTable = this.tables.find(t => t.id === rel.sourceTableId);
      const targetTable = this.tables.find(t => t.id === rel.targetTableId);

      if (!sourceTable || !targetTable) return;

      const sx = (sourceTable.positionX || 100) + 125;
      const sy = (sourceTable.positionY || 100) + 20;
      const tx = (targetTable.positionX || 100) + 125;
      const ty = (targetTable.positionY || 100) + 20;

      // Draw line
      const lineClass = `relationship-line ${rel.relationshipType.replace('_', '-')}`;

      relationshipsLayer.append('line')
        .attr('class', lineClass)
        .attr('x1', sx)
        .attr('y1', sy)
        .attr('x2', tx)
        .attr('y2', ty)
        .attr('data-relationship-id', rel.id)
        .on('click', function(event) {
          event.stopPropagation();
          self.selectRelationship(rel);
        })
        .on('contextmenu', function(event) {
          event.preventDefault();
          self.deleteRelationship(rel);
        });
    });
  },

  /**
   * Update sidebar with tables list
   */
  updateSidebar() {
    const listContainer = document.getElementById('tables-list');
    listContainer.innerHTML = '';

    if (this.tables.length === 0) {
      listContainer.innerHTML = '<p class="text-muted">No tables yet. Click "Add Table" to get started.</p>';
      return;
    }

    this.tables.forEach(table => {
      const item = document.createElement('div');
      item.className = 'table-list-item';
      item.innerHTML = `
        <div class="table-list-name">${table.displayName || table.name}</div>
        <div class="table-list-columns">${table.columns?.length || 0} columns</div>
      `;
      item.onclick = () => this.editTable(table);
      listContainer.appendChild(item);
    });
  },

  /**
   * Show add table modal
   */
  addTable() {
    // Reset form
    document.getElementById('new-table-name').value = '';
    document.getElementById('new-table-display-name').value = '';
    document.getElementById('new-table-description').value = '';
    document.getElementById('new-table-type').value = 'table';
    document.getElementById('new-table-color').value = '#667eea';
    document.getElementById('new-table-soft-delete').checked = true;
    document.getElementById('new-table-audited').checked = true;
    document.getElementById('new-table-temporal').checked = false;

    this.addTableModal.show();
  },

  /**
   * Apply template to new table
   */
  applyTemplate(templateName) {
    if (templateName === 'user') {
      document.getElementById('new-table-name').value = 'users';
      document.getElementById('new-table-display-name').value = 'Users';
      document.getElementById('new-table-description').value = 'User accounts and profiles';
    } else if (templateName === 'transaction') {
      document.getElementById('new-table-name').value = 'transactions';
      document.getElementById('new-table-display-name').value = 'Transactions';
      document.getElementById('new-table-description').value = 'Financial transactions';
    }
  },

  /**
   * Create new table
   */
  async createTable() {
    const name = document.getElementById('new-table-name').value.trim();
    const displayName = document.getElementById('new-table-display-name').value.trim();

    if (!name || !displayName) {
      alert('Please enter table name and display name');
      return;
    }

    const tableData = {
      name,
      displayName,
      description: document.getElementById('new-table-description').value.trim(),
      tableType: document.getElementById('new-table-type').value,
      color: document.getElementById('new-table-color').value,
      icon: document.getElementById('new-table-icon').value,
      positionX: 100 + (this.tables.length * 50),
      positionY: 100 + (this.tables.length * 50),
      isSoftDelete: document.getElementById('new-table-soft-delete').checked,
      isAudited: document.getElementById('new-table-audited').checked,
      isTemporal: document.getElementById('new-table-temporal').checked
    };

    try {
      const response = await fetch(`/forge/schema-designer/${this.schemaId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableData)
      });

      const result = await response.json();

      if (result.success) {
        this.tables.push(result.data);
        this.renderSchema();
        this.updateSidebar();
        this.updateSchemaInfo();
        this.addTableModal.hide();
        this.showSuccess('Table created successfully');
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      console.error('Error creating table:', error);
      this.showError('Error creating table: ' + error.message);
    }
  },

  /**
   * Select a table
   */
  selectTable(table) {
    this.selectedTable = table;

    // Highlight selected table
    d3.selectAll('.schema-table').classed('selected', false);
    d3.select(`[data-table-id="${table.id}"]`).classed('selected', true);

    // Update sidebar
    document.querySelectorAll('.table-list-item').forEach(item => {
      item.classList.remove('selected');
    });
  },

  /**
   * Edit a table
   */
  editTable(table) {
    this.currentTable = table;

    // Populate form
    document.getElementById('edit-table-title').textContent = table.displayName || table.name;
    document.getElementById('edit-table-name').value = table.name;
    document.getElementById('edit-table-display-name').value = table.displayName;
    document.getElementById('edit-table-description').value = table.description || '';
    document.getElementById('edit-table-color').value = table.color || '#667eea';
    document.getElementById('edit-table-icon').value = table.icon || 'table';

    // Load columns
    this.loadColumnsTab(table);

    this.editTableModal.show();
  },

  /**
   * Load columns tab
   */
  loadColumnsTab(table) {
    const container = document.getElementById('columns-list');
    container.innerHTML = '';

    const columns = table.columns || [];

    if (columns.length === 0) {
      container.innerHTML = '<p class="text-muted">No columns yet. Click "Add Column" to get started.</p>';
      return;
    }

    columns.forEach(col => {
      const row = document.createElement('div');
      row.className = 'column-row';
      row.innerHTML = `
        <div class="column-row-handle">⋮⋮</div>
        <div class="column-row-name">${col.name}</div>
        <div class="column-row-type">${col.dataType}</div>
        <div class="column-row-badges">
          ${col.isPrimaryKey ? '<span class="badge bg-danger">PK</span>' : ''}
          ${col.isUnique ? '<span class="badge bg-warning">UQ</span>' : ''}
          ${!col.isNullable ? '<span class="badge bg-info">NN</span>' : ''}
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick="schemaDesigner.deleteColumn('${col.id}')">
          <i class="bi bi-trash"></i>
        </button>
      `;
      container.appendChild(row);
    });
  },

  /**
   * Add column to current table
   */
  addColumn() {
    if (!this.currentTable) return;

    // Reset form
    document.getElementById('new-column-name').value = '';
    document.getElementById('new-column-display-name').value = '';
    document.getElementById('new-column-type').value = 'VARCHAR';
    document.getElementById('new-column-length').value = '';
    document.getElementById('new-column-default').value = '';
    document.getElementById('new-column-primary-key').checked = false;
    document.getElementById('new-column-nullable').checked = true;
    document.getElementById('new-column-unique').checked = false;

    this.addColumnModal.show();
  },

  /**
   * Create new column
   */
  async createColumn() {
    const name = document.getElementById('new-column-name').value.trim();
    const displayName = document.getElementById('new-column-display-name').value.trim();
    const dataType = document.getElementById('new-column-type').value;

    if (!name || !displayName) {
      alert('Please enter column name and display name');
      return;
    }

    const columnData = {
      name,
      displayName,
      dataType,
      length: document.getElementById('new-column-length').value || null,
      defaultValue: document.getElementById('new-column-default').value || null,
      isPrimaryKey: document.getElementById('new-column-primary-key').checked,
      isNullable: document.getElementById('new-column-nullable').checked,
      isUnique: document.getElementById('new-column-unique').checked
    };

    try {
      const response = await fetch(
        `/forge/schema-designer/${this.schemaId}/tables/${this.currentTable.id}/columns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(columnData)
        }
      );

      const result = await response.json();

      if (result.success) {
        // Add column to table
        if (!this.currentTable.columns) {
          this.currentTable.columns = [];
        }
        this.currentTable.columns.push(result.data);

        // Refresh UI
        this.loadColumnsTab(this.currentTable);
        this.renderSchema();
        this.addColumnModal.hide();
        this.showSuccess('Column added successfully');
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      console.error('Error creating column:', error);
      this.showError('Error creating column: ' + error.message);
    }
  },

  /**
   * Delete column
   */
  async deleteColumn(columnId) {
    if (!confirm('Delete this column?')) return;

    try {
      const response = await fetch(
        `/forge/schema-designer/${this.schemaId}/tables/${this.currentTable.id}/columns/${columnId}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (result.success) {
        this.currentTable.columns = this.currentTable.columns.filter(c => c.id !== columnId);
        this.loadColumnsTab(this.currentTable);
        this.renderSchema();
        this.showSuccess('Column deleted');
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      this.showError('Error deleting column: ' + error.message);
    }
  },

  /**
   * Save table changes
   */
  async saveTableChanges() {
    if (!this.currentTable) return;

    const updates = {
      name: document.getElementById('edit-table-name').value,
      displayName: document.getElementById('edit-table-display-name').value,
      description: document.getElementById('edit-table-description').value,
      color: document.getElementById('edit-table-color').value,
      icon: document.getElementById('edit-table-icon').value
    };

    try {
      const response = await fetch(
        `/forge/schema-designer/${this.schemaId}/tables/${this.currentTable.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        }
      );

      const result = await response.json();

      if (result.success) {
        Object.assign(this.currentTable, updates);
        this.renderSchema();
        this.updateSidebar();
        this.editTableModal.hide();
        this.showSuccess('Table updated successfully');
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      this.showError('Error saving table: ' + error.message);
    }
  },

  /**
   * Delete table
   */
  async deleteTable() {
    if (!this.currentTable) return;
    if (!confirm(`Delete table "${this.currentTable.displayName}"?`)) return;

    try {
      const response = await fetch(
        `/forge/schema-designer/${this.schemaId}/tables/${this.currentTable.id}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (result.success) {
        this.tables = this.tables.filter(t => t.id !== this.currentTable.id);
        this.renderSchema();
        this.updateSidebar();
        this.updateSchemaInfo();
        this.editTableModal.hide();
        this.showSuccess('Table deleted');
      } else {
        this.showError(result.message);
      }
    } catch (error) {
      this.showError('Error deleting table: ' + error.message);
    }
  },

  /**
   * Save table position after drag
   */
  async saveTablePosition(table) {
    try {
      await fetch(
        `/forge/schema-designer/${this.schemaId}/tables/${table.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positionX: table.positionX,
            positionY: table.positionY
          })
        }
      );
    } catch (error) {
      console.error('Error saving position:', error);
    }
  },

  /**
   * Auto-layout tables using force simulation
   */
  autoLayout() {
    const width = 800;
    const height = 600;

    // Create force simulation
    const simulation = d3.forceSimulation(this.tables)
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(150))
      .on('tick', () => {
        this.tables.forEach(table => {
          table.positionX = table.x;
          table.positionY = table.y;
        });
        this.renderSchema();
      });

    // Run simulation
    simulation.tick(100);
    simulation.stop();

    // Save all positions
    this.tables.forEach(table => this.saveTablePosition(table));
  },

  /**
   * Zoom to fit all tables
   */
  zoomToFit() {
    if (this.tables.length === 0) return;

    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    this.tables.forEach(table => {
      const x = table.positionX || 100;
      const y = table.positionY || 100;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 250);
      maxY = Math.max(maxY, y + 200);
    });

    const dx = maxX - minX;
    const dy = maxY - minY;
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    const scale = Math.min(0.9 / Math.max(dx / width, dy / height), 2);
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    this.svg.transition().duration(750).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  },

  /**
   * Generate code from schema
   */
  generateCode() {
    alert('Code generation coming soon! This will generate Sequelize models and migrations.');
  },

  /**
   * Save schema
   */
  async saveSchema() {
    this.showSuccess('Schema auto-saves. All changes are saved automatically.');
  },

  /**
   * Show settings modal
   */
  showSettings() {
    alert('Settings panel coming soon!');
  },

  /**
   * Add relationship
   */
  addRelationship() {
    alert('Relationship designer coming soon! You will be able to draw lines between tables.');
  },

  /**
   * Add index
   */
  addIndex() {
    alert('Index designer coming soon!');
  },

  /**
   * Select relationship
   */
  selectRelationship(relationship) {
    console.log('Selected relationship:', relationship);
  },

  /**
   * Delete relationship
   */
  async deleteRelationship(relationship) {
    if (!confirm('Delete this relationship?')) return;

    try {
      const response = await fetch(
        `/forge/schema-designer/${this.schemaId}/relationships/${relationship.id}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (result.success) {
        this.relationships = this.relationships.filter(r => r.id !== relationship.id);
        this.renderRelationships();
        this.updateSchemaInfo();
        this.showSuccess('Relationship deleted');
      }
    } catch (error) {
      this.showError('Error deleting relationship: ' + error.message);
    }
  },

  /**
   * Update minimap
   */
  updateMinimap() {
    // TODO: Implement minimap rendering
  },

  /**
   * Setup auto-save
   */
  setupAutoSave() {
    // Auto-save is implicit - all changes are saved immediately via API
    console.log('Auto-save enabled');
  },

  /**
   * Show success message
   */
  showSuccess(message) {
    // Use Bootstrap toast or alert
    alert(message);
  },

  /**
   * Show error message
   */
  showError(message) {
    alert('Error: ' + message);
  }
};
