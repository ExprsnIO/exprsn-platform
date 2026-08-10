/**
 * SVR Visual Designer - Canvas Management
 * Drag-and-drop, element selection, and canvas manipulation
 */

class DesignerCanvas {
  constructor() {
    this.canvas = document.getElementById('canvasDropzone');
    this.viewport = document.getElementById('canvasViewport');
    this.selectedElement = null;
    this.hoveredElement = null;
    this.clipboard = null;
    this.zoom = 1;
    this.device = 'desktop';
    this.draggedComponent = null;
    this.dropIndicator = null;

    this.init();
  }

  /**
   * Initialize canvas
   */
  init() {
    console.log('[Canvas] Initializing...');

    // Setup drag and drop
    this.setupDragDrop();

    // Setup selection
    this.setupSelection();

    // Setup keyboard shortcuts
    this.setupKeyboard();

    // Listen for component events
    this.setupComponentEvents();

    console.log('[Canvas] Initialized');
  }

  /**
   * Setup drag and drop functionality
   */
  setupDragDrop() {
    // Component library drag start
    document.querySelectorAll('.component-item[draggable="true"]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this.draggedComponent = e.target.getAttribute('data-component');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('component-type', this.draggedComponent);

        // Add dragging class
        e.target.classList.add('dragging');
      });

      item.addEventListener('dragend', (e) => {
        e.target.classList.remove('dragging');
        this.draggedComponent = null;
      });
    });

    // Canvas drop zone handlers
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Find drop target
      const target = this.findDropTarget(e.target);
      if (target) {
        this.showDropIndicator(target, e.clientY);
      }
    });

    this.canvas.addEventListener('dragleave', (e) => {
      this.hideDropIndicator();
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const componentType = e.dataTransfer.getData('component-type');
      if (!componentType) return;

      // Find drop target and position
      const target = this.findDropTarget(e.target);
      const position = this.getDropPosition(target, e.clientY);

      // Add component
      this.addComponent(componentType, target, position);

      // Hide indicator
      this.hideDropIndicator();

      // Mark canvas as having content
      this.canvas.classList.add('has-content');
    });

    // Element drag and drop (reordering)
    this.setupElementDragDrop();
  }

  /**
   * Setup element drag and drop for reordering
   */
  setupElementDragDrop() {
    // Will be called after element is added
    this.canvas.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('canvas-element')) {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('element-id', e.target.getAttribute('data-element-id'));
        e.target.classList.add('dragging');
      }
    }, true);

    this.canvas.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('canvas-element')) {
        e.target.classList.remove('dragging');
      }
    }, true);
  }

  /**
   * Find valid drop target
   * @param {HTMLElement} target - Event target
   * @returns {HTMLElement} - Drop target or canvas
   */
  findDropTarget(target) {
    // If target is canvas dropzone or empty canvas
    if (target === this.canvas || target.classList.contains('empty-canvas')) {
      return this.canvas;
    }

    // Find nearest canvas element
    let current = target;
    while (current && current !== this.canvas) {
      if (current.classList && current.classList.contains('canvas-element')) {
        const type = current.getAttribute('data-component-type');
        const component = ComponentLibrary.getComponent(type);
        if (component && component.droppable) {
          return current;
        }
      }
      current = current.parentElement;
    }

    return this.canvas;
  }

  /**
   * Get drop position relative to target
   * @param {HTMLElement} target - Drop target
   * @param {number} clientY - Mouse Y position
   * @returns {string} - 'before', 'after', or 'inside'
   */
  getDropPosition(target, clientY) {
    if (target === this.canvas) return 'inside';

    const rect = target.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;

    const component = ComponentLibrary.getComponent(target.getAttribute('data-component-type'));

    if (component && component.droppable) {
      return 'inside';
    }

    return clientY < middle ? 'before' : 'after';
  }

  /**
   * Show drop indicator
   * @param {HTMLElement} target - Drop target
   * @param {number} clientY - Mouse Y position
   */
  showDropIndicator(target, clientY) {
    if (!this.dropIndicator) {
      this.dropIndicator = document.createElement('div');
      this.dropIndicator.className = 'drop-indicator active';
    }

    const position = this.getDropPosition(target, clientY);

    if (position === 'inside' && target !== this.canvas) {
      target.classList.add('drag-over');
    } else {
      // Remove any existing drag-over classes
      document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });

      // Position indicator
      if (position === 'before') {
        target.parentNode.insertBefore(this.dropIndicator, target);
      } else if (position === 'after') {
        target.parentNode.insertBefore(this.dropIndicator, target.nextSibling);
      }
    }
  }

  /**
   * Hide drop indicator
   */
  hideDropIndicator() {
    if (this.dropIndicator && this.dropIndicator.parentNode) {
      this.dropIndicator.remove();
    }

    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  /**
   * Add component to canvas
   * @param {string} type - Component type
   * @param {HTMLElement} target - Drop target
   * @param {string} position - Drop position
   */
  addComponent(type, target, position) {
    const element = ComponentLibrary.generate(type);
    if (!element) return;

    // Make element draggable for reordering
    element.setAttribute('draggable', 'true');

    if (target === this.canvas) {
      this.canvas.appendChild(element);
    } else {
      if (position === 'inside') {
        // Insert before element controls
        const controls = target.querySelector('.element-controls');
        if (controls) {
          target.insertBefore(element, controls);
        } else {
          target.appendChild(element);
        }
      } else if (position === 'before') {
        target.parentNode.insertBefore(element, target);
      } else if (position === 'after') {
        target.parentNode.insertBefore(element, target.nextSibling);
      }
    }

    // Select the new element
    this.selectElement(element);

    // Trigger event
    const event = new CustomEvent('element-added', {
      detail: { element, type, target, position }
    });
    document.dispatchEvent(event);

    console.log('[Canvas] Added component:', type);
  }

  /**
   * Setup element selection
   */
  setupSelection() {
    this.canvas.addEventListener('click', (e) => {
      // Find clicked element
      let target = e.target;

      // Don't select if clicking controls
      if (target.closest('.element-controls')) {
        return;
      }

      // Find canvas element
      while (target && target !== this.canvas) {
        if (target.classList.contains('canvas-element')) {
          e.stopPropagation();
          this.selectElement(target);
          return;
        }
        target = target.parentElement;
      }

      // Clicked canvas background
      this.deselectElement();
    });

    // Context menu
    this.canvas.addEventListener('contextmenu', (e) => {
      let target = e.target;

      while (target && target !== this.canvas) {
        if (target.classList.contains('canvas-element')) {
          e.preventDefault();
          this.selectElement(target);
          this.showContextMenu(e.clientX, e.clientY, target);
          return;
        }
        target = target.parentElement;
      }
    });

    // Hide context menu on click anywhere
    document.addEventListener('click', () => {
      this.hideContextMenu();
    });
  }

  /**
   * Select an element
   * @param {HTMLElement} element - Element to select
   */
  selectElement(element) {
    // Deselect previous
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
    }

    // Select new
    this.selectedElement = element;
    element.classList.add('selected');
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Trigger event for property editor
    const event = new CustomEvent('element-selected', {
      detail: { element }
    });
    document.dispatchEvent(event);

    console.log('[Canvas] Selected element:', element.getAttribute('data-component-type'));
  }

  /**
   * Deselect current element
   */
  deselectElement() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove('selected');
      this.selectedElement = null;

      // Trigger event
      const event = new CustomEvent('element-deselected');
      document.dispatchEvent(event);
    }
  }

  /**
   * Show context menu
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {HTMLElement} element - Target element
   */
  showContextMenu(x, y, element) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Set current element
    menu.setAttribute('data-element-id', element.getAttribute('data-element-id'));
  }

  /**
   * Hide context menu
   */
  hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
      menu.style.display = 'none';
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Delete
      if (e.key === 'Delete' && this.selectedElement) {
        e.preventDefault();
        this.deleteElement(this.selectedElement);
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.selectedElement) {
        e.preventDefault();
        this.copyElement(this.selectedElement);
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && this.clipboard) {
        e.preventDefault();
        this.pasteElement();
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && this.selectedElement) {
        e.preventDefault();
        this.duplicateElement(this.selectedElement);
      }
    });
  }

  /**
   * Setup component event listeners
   */
  setupComponentEvents() {
    // Listen for component library events
    document.addEventListener('element-duplicated', (e) => {
      this.selectElement(e.detail.duplicate);
    });

    document.addEventListener('element-deleted', (e) => {
      if (e.detail.element === this.selectedElement) {
        this.deselectElement();
      }
    });
  }

  /**
   * Delete element
   * @param {HTMLElement} element - Element to delete
   */
  deleteElement(element) {
    ComponentLibrary.deleteElement(element);
    this.deselectElement();
  }

  /**
   * Copy element to clipboard
   * @param {HTMLElement} element - Element to copy
   */
  copyElement(element) {
    this.clipboard = ComponentLibrary.serialize(element);
    console.log('[Canvas] Copied element to clipboard');
  }

  /**
   * Paste element from clipboard
   */
  pasteElement() {
    if (!this.clipboard) return;

    const element = ComponentLibrary.deserialize(this.clipboard);
    element.setAttribute('draggable', 'true');

    // Insert after selected element or at end
    if (this.selectedElement) {
      this.selectedElement.parentNode.insertBefore(element, this.selectedElement.nextSibling);
    } else {
      this.canvas.appendChild(element);
    }

    this.selectElement(element);
    console.log('[Canvas] Pasted element from clipboard');
  }

  /**
   * Duplicate element
   * @param {HTMLElement} element - Element to duplicate
   */
  duplicateElement(element) {
    ComponentLibrary.duplicateElement(element);
  }

  /**
   * Set zoom level
   * @param {number} level - Zoom level
   */
  setZoom(level) {
    this.zoom = Math.max(
      DesignerConfig.canvas.minZoom,
      Math.min(DesignerConfig.canvas.maxZoom, level)
    );

    const canvas = document.getElementById('designerCanvas');
    canvas.style.transform = `scale(${this.zoom})`;
    canvas.style.transformOrigin = 'top center';

    // Update zoom display
    document.querySelector('.zoom-level').textContent = Math.round(this.zoom * 100) + '%';
  }

  /**
   * Zoom in
   */
  zoomIn() {
    this.setZoom(this.zoom + DesignerConfig.canvas.zoomStep);
  }

  /**
   * Zoom out
   */
  zoomOut() {
    this.setZoom(this.zoom - DesignerConfig.canvas.zoomStep);
  }

  /**
   * Reset zoom
   */
  zoomReset() {
    this.setZoom(1);
  }

  /**
   * Set device mode
   * @param {string} device - Device name
   */
  setDevice(device) {
    this.device = device;
    const canvas = document.getElementById('designerCanvas');
    canvas.setAttribute('data-device', device);

    console.log('[Canvas] Device changed to:', device);
  }

  /**
   * Clear canvas
   */
  clear() {
    if (confirm('Clear all content? This cannot be undone.')) {
      this.canvas.innerHTML = '<div class="empty-canvas"><i class="fas fa-plus-circle"></i><p>Drag components here to start building</p></div>';
      this.canvas.classList.remove('has-content');
      this.deselectElement();
      console.log('[Canvas] Cleared');
    }
  }

  /**
   * Get canvas HTML
   * @param {boolean} includeStyles - Include inline styles
   * @returns {string} - HTML string
   */
  getHTML(includeStyles = true) {
    const elements = Array.from(this.canvas.children).filter(el =>
      el.classList.contains('canvas-element')
    );

    let html = '';
    elements.forEach(el => {
      html += ComponentLibrary.exportHTML(el, includeStyles) + '\n';
    });

    return html.trim();
  }

  /**
   * Set canvas HTML
   * @param {string} html - HTML string
   */
  setHTML(html) {
    // Clear canvas
    this.canvas.innerHTML = '';

    // Parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Convert to canvas elements
    Array.from(temp.children).forEach(child => {
      this.importElement(child);
    });

    // Update state
    if (this.canvas.children.length > 0) {
      this.canvas.classList.add('has-content');
    }
  }

  /**
   * Import external HTML element to canvas
   * @param {HTMLElement} element - Element to import
   */
  importElement(element) {
    // Try to determine component type from element
    const type = this.detectComponentType(element);

    if (type) {
      // Use component library
      const canvasElement = ComponentLibrary.generate(type);
      this.canvas.appendChild(canvasElement);
    } else {
      // Import as-is and wrap as generic component
      element.classList.add('canvas-element');
      element.setAttribute('data-element-id', 'elem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
      element.setAttribute('data-component-type', 'generic');
      element.setAttribute('draggable', 'true');
      ComponentLibrary.addElementControls(element);
      this.canvas.appendChild(element);
    }
  }

  /**
   * Detect component type from HTML element
   * @param {HTMLElement} element - Element to detect
   * @returns {string|null} - Component type or null
   */
  detectComponentType(element) {
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList);

    // Check common patterns
    if (tag === 'div' && classes.includes('container')) return 'container';
    if (tag === 'div' && classes.includes('row')) return 'row';
    if (tag === 'div' && classes.includes('col')) return 'column';
    if (tag === 'section') return 'section';
    if (tag === 'hr') return 'divider';
    if (tag.startsWith('h')) return 'heading';
    if (tag === 'p') return 'paragraph';
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'img') return 'image';
    if (tag === 'form') return 'form';
    if (tag === 'input') return 'input';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    if (tag === 'table') return 'table';

    return null;
  }

  /**
   * Serialize canvas to JSON
   * @returns {object} - Canvas data
   */
  toJSON() {
    const elements = Array.from(this.canvas.children).filter(el =>
      el.classList.contains('canvas-element')
    );

    return {
      device: this.device,
      zoom: this.zoom,
      elements: elements.map(el => ComponentLibrary.serialize(el))
    };
  }

  /**
   * Load canvas from JSON
   * @param {object} data - Canvas data
   */
  fromJSON(data) {
    // Clear canvas
    this.canvas.innerHTML = '';

    // Restore elements
    if (data.elements && data.elements.length > 0) {
      data.elements.forEach(elementData => {
        const element = ComponentLibrary.deserialize(elementData);
        element.setAttribute('draggable', 'true');
        this.canvas.appendChild(element);
      });

      this.canvas.classList.add('has-content');
    }

    // Restore settings
    if (data.device) {
      this.setDevice(data.device);
    }
    if (data.zoom) {
      this.setZoom(data.zoom);
    }
  }

  /**
   * Get selected element
   * @returns {HTMLElement|null} - Selected element
   */
  getSelectedElement() {
    return this.selectedElement;
  }

  /**
   * Has content
   * @returns {boolean} - Has content
   */
  hasContent() {
    return this.canvas.children.length > 0 &&
           Array.from(this.canvas.children).some(el => el.classList.contains('canvas-element'));
  }
}

// Make globally accessible
window.DesignerCanvas = DesignerCanvas;

console.log('[Canvas] Module loaded');
