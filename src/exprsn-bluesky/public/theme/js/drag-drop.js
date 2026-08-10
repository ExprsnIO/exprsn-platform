/**
 * Exprsn Drag and Drop Module
 * WCAG 2.1 AA Compliant - Full keyboard and screen reader support
 * Supports tables, lists, and custom elements
 */

class ExpRsnDragDrop {
  constructor(options = {}) {
    this.options = {
      containerSelector: options.containerSelector || '.table-draggable tbody',
      itemSelector: options.itemSelector || 'tr',
      handleSelector: options.handleSelector || '.drag-handle',
      onDragStart: options.onDragStart || null,
      onDragEnd: options.onDragEnd || null,
      onDrop: options.onDrop || null,
      announceMessages: options.announceMessages !== false,
      ...options
    };

    this.draggedElement = null;
    this.draggedIndex = null;
    this.currentIndex = null;
    this.containers = [];

    this.init();
  }

  /**
   * Initialize drag and drop functionality
   */
  init() {
    this.containers = document.querySelectorAll(this.options.containerSelector);

    this.containers.forEach(container => {
      this.setupContainer(container);
    });

    // Create live region for screen reader announcements
    this.createLiveRegion();
  }

  /**
   * Set up a draggable container
   * @param {HTMLElement} container - Container element
   */
  setupContainer(container) {
    const items = container.querySelectorAll(this.options.itemSelector);

    items.forEach((item, index) => {
      this.setupDraggableItem(item, index);
    });
  }

  /**
   * Set up individual draggable item with ARIA attributes
   * @param {HTMLElement} item - Draggable item
   * @param {number} index - Item index
   */
  setupDraggableItem(item, index) {
    // Make item draggable
    item.setAttribute('draggable', 'true');
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-grabbed', 'false');
    item.setAttribute('data-drag-index', index);

    // Add visual drag handle if not present
    if (!item.querySelector(this.options.handleSelector)) {
      this.addDragHandle(item);
    }

    // Set up event listeners
    this.addDragListeners(item);
    this.addKeyboardListeners(item);
  }

  /**
   * Add drag handle to item
   * @param {HTMLElement} item - Item to add handle to
   */
  addDragHandle(item) {
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.setAttribute('type', 'button');
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.innerHTML = '⋮⋮';

    // Add instructions for screen readers
    const instructions = document.createElement('span');
    instructions.className = 'drag-instructions sr-only';
    instructions.textContent = 'Press Space or Enter to grab, arrow keys to move, Space or Enter to drop, Escape to cancel';
    handle.appendChild(instructions);

    const firstCell = item.querySelector('td') || item;
    firstCell.insertBefore(handle, firstCell.firstChild);
  }

  /**
   * Add drag event listeners
   * @param {HTMLElement} item - Draggable item
   */
  addDragListeners(item) {
    item.addEventListener('dragstart', (e) => this.handleDragStart(e));
    item.addEventListener('dragover', (e) => this.handleDragOver(e));
    item.addEventListener('drop', (e) => this.handleDrop(e));
    item.addEventListener('dragend', (e) => this.handleDragEnd(e));
    item.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    item.addEventListener('dragleave', (e) => this.handleDragLeave(e));
  }

  /**
   * Add keyboard event listeners for accessibility
   * @param {HTMLElement} item - Draggable item
   */
  addKeyboardListeners(item) {
    item.addEventListener('keydown', (e) => {
      const grabbed = item.getAttribute('aria-grabbed') === 'true';

      switch(e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (grabbed) {
            this.dropWithKeyboard(item);
          } else {
            this.grabWithKeyboard(item);
          }
          break;

        case 'Escape':
          if (grabbed) {
            e.preventDefault();
            this.cancelDrag(item);
          }
          break;

        case 'ArrowUp':
          if (grabbed) {
            e.preventDefault();
            this.moveUp(item);
          }
          break;

        case 'ArrowDown':
          if (grabbed) {
            e.preventDefault();
            this.moveDown(item);
          }
          break;
      }
    });
  }

  /**
   * Handle drag start event
   * @param {DragEvent} e - Drag event
   */
  handleDragStart(e) {
    const item = e.currentTarget;
    this.draggedElement = item;
    this.draggedIndex = parseInt(item.getAttribute('data-drag-index'));

    item.classList.add('dragging');
    item.setAttribute('aria-grabbed', 'true');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.innerHTML);

    if (this.options.onDragStart) {
      this.options.onDragStart(item, this.draggedIndex);
    }

    this.announce(`Grabbed item at position ${this.draggedIndex + 1}`);
  }

  /**
   * Handle drag over event
   * @param {DragEvent} e - Drag event
   */
  handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }

    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  /**
   * Handle drag enter event
   * @param {DragEvent} e - Drag event
   */
  handleDragEnter(e) {
    const item = e.currentTarget;
    if (item !== this.draggedElement) {
      item.classList.add('drag-over');
    }
  }

  /**
   * Handle drag leave event
   * @param {DragEvent} e - Drag event
   */
  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  /**
   * Handle drop event
   * @param {DragEvent} e - Drag event
   */
  handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    const dropTarget = e.currentTarget;
    dropTarget.classList.remove('drag-over');

    if (this.draggedElement && this.draggedElement !== dropTarget) {
      const dropIndex = parseInt(dropTarget.getAttribute('data-drag-index'));
      this.swapElements(this.draggedElement, dropTarget);

      if (this.options.onDrop) {
        this.options.onDrop(this.draggedElement, this.draggedIndex, dropIndex);
      }

      this.announce(`Moved item from position ${this.draggedIndex + 1} to position ${dropIndex + 1}`);
    }

    return false;
  }

  /**
   * Handle drag end event
   * @param {DragEvent} e - Drag event
   */
  handleDragEnd(e) {
    const item = e.currentTarget;
    item.classList.remove('dragging');
    item.setAttribute('aria-grabbed', 'false');

    // Remove drag-over class from all items
    const container = item.closest(this.options.containerSelector);
    const items = container.querySelectorAll(this.options.itemSelector);
    items.forEach(item => item.classList.remove('drag-over'));

    if (this.options.onDragEnd) {
      this.options.onDragEnd(item);
    }

    this.draggedElement = null;
    this.draggedIndex = null;
  }

  /**
   * Grab item with keyboard
   * @param {HTMLElement} item - Item to grab
   */
  grabWithKeyboard(item) {
    this.draggedElement = item;
    this.draggedIndex = parseInt(item.getAttribute('data-drag-index'));
    this.currentIndex = this.draggedIndex;

    item.setAttribute('aria-grabbed', 'true');
    item.classList.add('dragging');

    if (this.options.onDragStart) {
      this.options.onDragStart(item, this.draggedIndex);
    }

    this.announce(`Grabbed item at position ${this.draggedIndex + 1}. Use arrow keys to move, Space or Enter to drop, Escape to cancel.`);
  }

  /**
   * Drop item with keyboard
   * @param {HTMLElement} item - Item to drop
   */
  dropWithKeyboard(item) {
    item.setAttribute('aria-grabbed', 'false');
    item.classList.remove('dragging');

    if (this.options.onDrop && this.currentIndex !== this.draggedIndex) {
      this.options.onDrop(item, this.draggedIndex, this.currentIndex);
      this.announce(`Moved item from position ${this.draggedIndex + 1} to position ${this.currentIndex + 1}`);
    } else {
      this.announce(`Dropped item at position ${this.currentIndex + 1}`);
    }

    if (this.options.onDragEnd) {
      this.options.onDragEnd(item);
    }

    this.draggedElement = null;
    this.draggedIndex = null;
    this.currentIndex = null;
  }

  /**
   * Cancel drag operation
   * @param {HTMLElement} item - Item being dragged
   */
  cancelDrag(item) {
    item.setAttribute('aria-grabbed', 'false');
    item.classList.remove('dragging');

    this.announce('Drag cancelled');

    this.draggedElement = null;
    this.draggedIndex = null;
    this.currentIndex = null;
  }

  /**
   * Move item up in the list
   * @param {HTMLElement} item - Item to move
   */
  moveUp(item) {
    const container = item.closest(this.options.containerSelector);
    const items = Array.from(container.querySelectorAll(this.options.itemSelector));
    const currentIndex = items.indexOf(item);

    if (currentIndex > 0) {
      const previousItem = items[currentIndex - 1];
      container.insertBefore(item, previousItem);

      this.currentIndex = currentIndex - 1;
      this.updateIndices(container);

      item.focus();
      this.announce(`Moved to position ${this.currentIndex + 1}`);
    } else {
      this.announce('Already at the top');
    }
  }

  /**
   * Move item down in the list
   * @param {HTMLElement} item - Item to move
   */
  moveDown(item) {
    const container = item.closest(this.options.containerSelector);
    const items = Array.from(container.querySelectorAll(this.options.itemSelector));
    const currentIndex = items.indexOf(item);

    if (currentIndex < items.length - 1) {
      const nextItem = items[currentIndex + 1];
      container.insertBefore(nextItem, item);

      this.currentIndex = currentIndex + 1;
      this.updateIndices(container);

      item.focus();
      this.announce(`Moved to position ${this.currentIndex + 1}`);
    } else {
      this.announce('Already at the bottom');
    }
  }

  /**
   * Swap two elements in the DOM
   * @param {HTMLElement} elem1 - First element
   * @param {HTMLElement} elem2 - Second element
   */
  swapElements(elem1, elem2) {
    const parent1 = elem1.parentNode;
    const parent2 = elem2.parentNode;
    const next1 = elem1.nextSibling;
    const next2 = elem2.nextSibling;

    if (next1 === elem2) {
      parent1.insertBefore(elem2, elem1);
    } else if (next2 === elem1) {
      parent2.insertBefore(elem1, elem2);
    } else {
      parent1.insertBefore(elem2, next1);
      parent2.insertBefore(elem1, next2);
    }

    // Update indices after swap
    this.updateIndices(parent1);
  }

  /**
   * Update data-drag-index for all items in container
   * @param {HTMLElement} container - Container element
   */
  updateIndices(container) {
    const items = container.querySelectorAll(this.options.itemSelector);
    items.forEach((item, index) => {
      item.setAttribute('data-drag-index', index);
    });
  }

  /**
   * Create ARIA live region for announcements
   */
  createLiveRegion() {
    if (!document.getElementById('drag-drop-announcer')) {
      const announcer = document.createElement('div');
      announcer.id = 'drag-drop-announcer';
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }
  }

  /**
   * Announce message to screen readers
   * @param {string} message - Message to announce
   */
  announce(message) {
    if (!this.options.announceMessages) return;

    const announcer = document.getElementById('drag-drop-announcer');
    if (announcer) {
      // Clear and set new message for announcement
      announcer.textContent = '';
      setTimeout(() => {
        announcer.textContent = message;
      }, 100);
    }
  }

  /**
   * Destroy drag and drop functionality
   */
  destroy() {
    this.containers.forEach(container => {
      const items = container.querySelectorAll(this.options.itemSelector);
      items.forEach(item => {
        item.removeAttribute('draggable');
        item.removeAttribute('tabindex');
        item.removeAttribute('role');
        item.removeAttribute('aria-grabbed');
        item.removeAttribute('data-drag-index');
        item.classList.remove('dragging', 'drag-over');

        // Remove drag handle if added
        const handle = item.querySelector(this.options.handleSelector);
        if (handle) {
          handle.remove();
        }
      });
    });

    // Remove live region
    const announcer = document.getElementById('drag-drop-announcer');
    if (announcer) {
      announcer.remove();
    }
  }

  /**
   * Refresh drag and drop functionality
   */
  refresh() {
    this.destroy();
    this.init();
  }
}

/**
 * Draggable List (for non-table elements)
 * Extends ExpRsnDragDrop for general list items
 */
class ExpRsnDraggableList extends ExpRsnDragDrop {
  constructor(options = {}) {
    super({
      containerSelector: options.containerSelector || '.draggable-list',
      itemSelector: options.itemSelector || '.draggable-item',
      handleSelector: options.handleSelector || '.drag-handle',
      ...options
    });
  }

  /**
   * Override to add different styling for list items
   */
  addDragHandle(item) {
    const handle = document.createElement('button');
    handle.className = 'drag-handle btn btn-sm btn-outline-secondary';
    handle.setAttribute('type', 'button');
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.innerHTML = '<span aria-hidden="true">☰</span>';

    const instructions = document.createElement('span');
    instructions.className = 'drag-instructions sr-only';
    instructions.textContent = 'Press Space or Enter to grab, arrow keys to move, Space or Enter to drop, Escape to cancel';
    handle.appendChild(instructions);

    item.insertBefore(handle, item.firstChild);
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExpRsnDragDrop, ExpRsnDraggableList };
}

// Auto-initialize on DOM ready if data attribute present
document.addEventListener('DOMContentLoaded', () => {
  // Initialize tables with data-draggable attribute
  const draggableTables = document.querySelectorAll('[data-draggable="table"]');
  draggableTables.forEach(table => {
    new ExpRsnDragDrop({
      containerSelector: `#${table.id} tbody`,
      onDrop: (element, fromIndex, toIndex) => {
        // Dispatch custom event for external handling
        const event = new CustomEvent('exprsn:dragdrop', {
          detail: { element, fromIndex, toIndex },
          bubbles: true
        });
        table.dispatchEvent(event);
      }
    });
  });

  // Initialize lists with data-draggable attribute
  const draggableLists = document.querySelectorAll('[data-draggable="list"]');
  draggableLists.forEach(list => {
    new ExpRsnDraggableList({
      containerSelector: `#${list.id}`,
      onDrop: (element, fromIndex, toIndex) => {
        const event = new CustomEvent('exprsn:dragdrop', {
          detail: { element, fromIndex, toIndex },
          bubbles: true
        });
        list.dispatchEvent(event);
      }
    });
  });
});
