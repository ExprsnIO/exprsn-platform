/**
 * Designer Layers Panel
 * Hierarchical view of canvas elements with selection, visibility, and ordering controls
 */

class DesignerLayers {
  constructor(designer) {
    this.designer = designer;
    this.layersTree = null;
    this.selectedLayerId = null;
    this.lockedLayers = new Set();
    this.hiddenLayers = new Set();

    this.init();
  }

  /**
   * Initialize layers panel
   */
  init() {
    this.setupUI();
    this.setupEventListeners();
    this.refresh();
  }

  /**
   * Setup UI elements
   */
  setupUI() {
    const panel = document.getElementById('layers-panel');
    if (!panel) {
      console.warn('Layers panel not found');
      return;
    }

    // Create layers UI if it doesn't exist
    if (!document.getElementById('layers-tree')) {
      this.createLayersUI();
    }
  }

  /**
   * Create layers UI
   */
  createLayersUI() {
    const panel = document.getElementById('layers-panel');
    if (!panel) return;

    const layersHTML = `
      <div class="layers-container">
        <!-- Toolbar -->
        <div class="layers-toolbar">
          <button
            id="layers-expand-all"
            class="btn btn-sm btn-outline-secondary"
            title="Expand All"
          >
            <i class="fas fa-plus-square"></i>
          </button>
          <button
            id="layers-collapse-all"
            class="btn btn-sm btn-outline-secondary"
            title="Collapse All"
          >
            <i class="fas fa-minus-square"></i>
          </button>
          <button
            id="layers-refresh"
            class="btn btn-sm btn-outline-primary"
            title="Refresh"
          >
            <i class="fas fa-sync"></i>
          </button>
        </div>

        <!-- Layers Tree -->
        <div id="layers-tree" class="layers-tree">
          <div class="layers-empty">
            <i class="fas fa-layer-group fa-2x"></i>
            <p>No elements on canvas</p>
          </div>
        </div>
      </div>
    `;

    panel.innerHTML = layersHTML;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Toolbar buttons
    const expandBtn = document.getElementById('layers-expand-all');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.expandAll());
    }

    const collapseBtn = document.getElementById('layers-collapse-all');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.collapseAll());
    }

    const refreshBtn = document.getElementById('layers-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Listen for canvas changes
    if (this.designer.canvas) {
      this.designer.canvas.on('elementAdded', () => this.refresh());
      this.designer.canvas.on('elementRemoved', () => this.refresh());
      this.designer.canvas.on('elementSelected', (id) => this.selectLayer(id));
    }
  }

  /**
   * Refresh layers tree from canvas
   */
  refresh() {
    const canvas = document.getElementById('designer-canvas');
    if (!canvas) return;

    // Build tree from canvas DOM
    const tree = this.buildTreeFromDOM(canvas);
    this.layersTree = tree;
    this.render();
  }

  /**
   * Build layer tree from DOM
   */
  buildTreeFromDOM(element, level = 0) {
    const children = Array.from(element.children).filter(child => {
      // Filter out designer-specific elements
      return !child.classList.contains('drop-indicator') &&
             !child.classList.contains('selection-overlay');
    });

    return children.map(child => {
      const id = child.id || `element-${Math.random().toString(36).substr(2, 9)}`;
      if (!child.id) child.id = id;

      return {
        id,
        element: child,
        tagName: child.tagName.toLowerCase(),
        classes: Array.from(child.classList).filter(c => !c.startsWith('designer-')),
        level,
        children: this.buildTreeFromDOM(child, level + 1),
        isLocked: this.lockedLayers.has(id),
        isHidden: this.hiddenLayers.has(id)
      };
    });
  }

  /**
   * Render layers tree
   */
  render() {
    const treeEl = document.getElementById('layers-tree');
    if (!treeEl) return;

    if (!this.layersTree || this.layersTree.length === 0) {
      treeEl.innerHTML = `
        <div class="layers-empty">
          <i class="fas fa-layer-group fa-2x"></i>
          <p>No elements on canvas</p>
          <p class="text-muted small">Drag components to canvas to start</p>
        </div>
      `;
      return;
    }

    const layersHTML = this.renderTreeNodes(this.layersTree);
    treeEl.innerHTML = layersHTML;

    // Setup event listeners for layer items
    this.setupLayerListeners();
  }

  /**
   * Render tree nodes recursively
   */
  renderTreeNodes(nodes, level = 0) {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isSelected = this.selectedLayerId === node.id;
      const indent = level * 20;

      const label = this.getLayerLabel(node);
      const icon = this.getLayerIcon(node.tagName);

      return `
        <div
          class="layer-item ${isSelected ? 'selected' : ''} ${node.isHidden ? 'hidden' : ''}"
          data-layer-id="${node.id}"
          data-level="${level}"
          style="padding-left: ${indent}px;"
          draggable="true"
        >
          <div class="layer-item-content">
            ${hasChildren ? `
              <button class="layer-toggle" data-id="${node.id}">
                <i class="fas fa-chevron-down"></i>
              </button>
            ` : '<span class="layer-spacer"></span>'}

            <i class="${icon} layer-icon"></i>

            <span class="layer-label">${label}</span>

            <div class="layer-actions">
              <button
                class="layer-action-btn"
                data-action="visibility"
                data-id="${node.id}"
                title="${node.isHidden ? 'Show' : 'Hide'}"
              >
                <i class="fas fa-${node.isHidden ? 'eye-slash' : 'eye'}"></i>
              </button>
              <button
                class="layer-action-btn"
                data-action="lock"
                data-id="${node.id}"
                title="${node.isLocked ? 'Unlock' : 'Lock'}"
              >
                <i class="fas fa-${node.isLocked ? 'lock' : 'unlock'}"></i>
              </button>
              <button
                class="layer-action-btn"
                data-action="delete"
                data-id="${node.id}"
                title="Delete"
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          ${hasChildren ? `
            <div class="layer-children">
              ${this.renderTreeNodes(node.children, level + 1)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Get layer label
   */
  getLayerLabel(node) {
    // Try to get meaningful label
    if (node.element.id && !node.element.id.startsWith('element-')) {
      return `#${node.element.id}`;
    }

    if (node.classes.length > 0) {
      return `.${node.classes[0]}`;
    }

    // Get text content if it's a text element
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'button'].includes(node.tagName)) {
      const text = node.element.textContent.trim();
      if (text && text.length > 0) {
        return text.substring(0, 20) + (text.length > 20 ? '...' : '');
      }
    }

    return `<${node.tagName}>`;
  }

  /**
   * Get layer icon
   */
  getLayerIcon(tagName) {
    const icons = {
      div: 'fas fa-square',
      section: 'fas fa-window-maximize',
      article: 'fas fa-file-alt',
      header: 'fas fa-heading',
      footer: 'fas fa-shoe-prints',
      nav: 'fas fa-bars',
      aside: 'fas fa-sidebar',
      main: 'fas fa-file',
      p: 'fas fa-paragraph',
      h1: 'fas fa-heading',
      h2: 'fas fa-heading',
      h3: 'fas fa-heading',
      h4: 'fas fa-heading',
      h5: 'fas fa-heading',
      h6: 'fas fa-heading',
      span: 'fas fa-font',
      a: 'fas fa-link',
      button: 'fas fa-mouse-pointer',
      img: 'fas fa-image',
      video: 'fas fa-video',
      ul: 'fas fa-list-ul',
      ol: 'fas fa-list-ol',
      li: 'fas fa-list',
      table: 'fas fa-table',
      form: 'fas fa-wpforms',
      input: 'fas fa-keyboard',
      textarea: 'fas fa-align-left',
      select: 'fas fa-caret-square-down'
    };

    return icons[tagName] || 'fas fa-code';
  }

  /**
   * Setup layer item listeners
   */
  setupLayerListeners() {
    // Click to select
    document.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.layer-action-btn') || e.target.closest('.layer-toggle')) {
          return;
        }

        const layerId = item.dataset.layerId;
        this.selectLayer(layerId);

        // Also select in canvas
        const element = document.getElementById(layerId);
        if (element && this.designer.canvas) {
          this.designer.canvas.selectElement(element);
        }
      });

      // Drag to reorder
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('layer-id', item.dataset.layerId);
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');

        const draggedId = e.dataTransfer.getData('layer-id');
        const targetId = item.dataset.layerId;

        if (draggedId && targetId && draggedId !== targetId) {
          this.reorderLayers(draggedId, targetId);
        }
      });
    });

    // Toggle collapse/expand
    document.querySelectorAll('.layer-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = btn.dataset.id;
        this.toggleCollapse(layerId);
      });
    });

    // Action buttons
    document.querySelectorAll('.layer-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const layerId = btn.dataset.id;

        switch (action) {
          case 'visibility':
            this.toggleVisibility(layerId);
            break;
          case 'lock':
            this.toggleLock(layerId);
            break;
          case 'delete':
            this.deleteLayer(layerId);
            break;
        }
      });
    });
  }

  /**
   * Select layer
   */
  selectLayer(layerId) {
    this.selectedLayerId = layerId;

    // Update UI
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.layerId === layerId);
    });
  }

  /**
   * Toggle layer visibility
   */
  toggleVisibility(layerId) {
    const element = document.getElementById(layerId);
    if (!element) return;

    if (this.hiddenLayers.has(layerId)) {
      this.hiddenLayers.delete(layerId);
      element.style.display = '';
    } else {
      this.hiddenLayers.add(layerId);
      element.style.display = 'none';
    }

    this.refresh();
  }

  /**
   * Toggle layer lock
   */
  toggleLock(layerId) {
    if (this.lockedLayers.has(layerId)) {
      this.lockedLayers.delete(layerId);
    } else {
      this.lockedLayers.add(layerId);
    }

    this.refresh();
  }

  /**
   * Delete layer
   */
  deleteLayer(layerId) {
    if (!confirm('Delete this element?')) return;

    const element = document.getElementById(layerId);
    if (element) {
      element.remove();
      this.refresh();

      if (this.designer.canvas) {
        this.designer.canvas.clearSelection();
      }
    }
  }

  /**
   * Toggle collapse/expand
   */
  toggleCollapse(layerId) {
    const layerItem = document.querySelector(`[data-layer-id="${layerId}"]`);
    if (!layerItem) return;

    const children = layerItem.querySelector('.layer-children');
    const toggleBtn = layerItem.querySelector('.layer-toggle i');

    if (children) {
      const isCollapsed = children.style.display === 'none';

      children.style.display = isCollapsed ? 'block' : 'none';
      toggleBtn.classList.toggle('fa-chevron-down', isCollapsed);
      toggleBtn.classList.toggle('fa-chevron-right', !isCollapsed);
    }
  }

  /**
   * Expand all layers
   */
  expandAll() {
    document.querySelectorAll('.layer-children').forEach(el => {
      el.style.display = 'block';
    });
    document.querySelectorAll('.layer-toggle i').forEach(icon => {
      icon.classList.remove('fa-chevron-right');
      icon.classList.add('fa-chevron-down');
    });
  }

  /**
   * Collapse all layers
   */
  collapseAll() {
    document.querySelectorAll('.layer-children').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.layer-toggle i').forEach(icon => {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-right');
    });
  }

  /**
   * Reorder layers by dragging
   */
  reorderLayers(draggedId, targetId) {
    const draggedEl = document.getElementById(draggedId);
    const targetEl = document.getElementById(targetId);

    if (!draggedEl || !targetEl) return;

    // Get parent container
    const parent = targetEl.parentElement;
    if (!parent) return;

    // Insert dragged element before target
    parent.insertBefore(draggedEl, targetEl);

    // Refresh layers view
    this.refresh();

    if (this.designer) {
      this.designer.showNotification('Element reordered', 'success');
    }
  }

  /**
   * Check if layer is locked
   */
  isLocked(layerId) {
    return this.lockedLayers.has(layerId);
  }

  /**
   * Check if layer is hidden
   */
  isHidden(layerId) {
    return this.hiddenLayers.has(layerId);
  }
}

// Make available globally
window.DesignerLayers = DesignerLayers;
