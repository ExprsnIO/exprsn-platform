/**
 * Exprsn UI Components
 * Modal dialogs, popups, alerts, and interactive components
 * WCAG 2.1 AA Compliant
 */

/**
 * Modal Dialog Manager
 * WCAG 2.4.3 Focus Order - Traps focus within modal
 */
class ExpRsnModal {
  constructor(modalId, options = {}) {
    this.modalId = modalId;
    this.modal = document.getElementById(modalId);
    this.overlay = null;
    this.previousFocus = null;
    this.focusableElements = [];

    this.options = {
      closeOnEscape: options.closeOnEscape !== false,
      closeOnOverlayClick: options.closeOnOverlayClick !== false,
      onOpen: options.onOpen || null,
      onClose: options.onClose || null,
      ...options
    };

    if (this.modal) {
      this.init();
    } else {
      console.warn(`Modal with id "${modalId}" not found`);
    }
  }

  /**
   * Initialize modal
   */
  init() {
    // Ensure modal has proper ARIA attributes
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-hidden', 'true');

    // Get or create overlay
    this.overlay = this.modal.closest('.modal-overlay');
    if (!this.overlay) {
      console.warn('Modal should be wrapped in .modal-overlay element');
    }

    // Set up close buttons
    this.setupCloseButtons();

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Set up close buttons
   */
  setupCloseButtons() {
    const closeButtons = this.modal.querySelectorAll('[data-modal-close]');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => this.close());
    });
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Close on Escape key
    if (this.options.closeOnEscape) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          this.close();
        }
      });
    }

    // Close on overlay click
    if (this.options.closeOnOverlayClick && this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }
  }

  /**
   * Open modal
   */
  open() {
    // Store currently focused element
    this.previousFocus = document.activeElement;

    // Show modal
    if (this.overlay) {
      this.overlay.classList.add('show');
      this.overlay.style.display = 'flex';
    }

    this.modal.setAttribute('aria-hidden', 'false');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Get all focusable elements
    this.updateFocusableElements();

    // Focus first element
    this.focusFirstElement();

    // Set up focus trap
    this.setupFocusTrap();

    // Fire onOpen callback
    if (this.options.onOpen) {
      this.options.onOpen(this);
    }

    // Announce to screen readers
    this.announce('Modal opened');
  }

  /**
   * Close modal
   */
  close() {
    // Hide modal
    if (this.overlay) {
      this.overlay.classList.remove('show');
      setTimeout(() => {
        this.overlay.style.display = 'none';
      }, 300); // Match CSS transition duration
    }

    this.modal.setAttribute('aria-hidden', 'true');

    // Restore body scroll
    document.body.style.overflow = '';

    // Restore focus to previous element
    if (this.previousFocus) {
      this.previousFocus.focus();
      this.previousFocus = null;
    }

    // Fire onClose callback
    if (this.options.onClose) {
      this.options.onClose(this);
    }

    // Announce to screen readers
    this.announce('Modal closed');
  }

  /**
   * Toggle modal open/closed
   */
  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Check if modal is open
   * @returns {boolean} True if modal is open
   */
  isOpen() {
    return this.modal.getAttribute('aria-hidden') === 'false';
  }

  /**
   * Update list of focusable elements
   */
  updateFocusableElements() {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];

    this.focusableElements = Array.from(
      this.modal.querySelectorAll(focusableSelectors.join(','))
    );
  }

  /**
   * Focus first focusable element
   */
  focusFirstElement() {
    if (this.focusableElements.length > 0) {
      this.focusableElements[0].focus();
    } else {
      this.modal.focus();
    }
  }

  /**
   * Set up focus trap to keep focus within modal
   */
  setupFocusTrap() {
    this.modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      const firstElement = this.focusableElements[0];
      const lastElement = this.focusableElements[this.focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }

  /**
   * Announce message to screen readers
   * @param {string} message - Message to announce
   */
  announce(message) {
    let announcer = document.getElementById('modal-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'modal-announcer';
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }

    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  }
}

/**
 * Popup/Popover Manager
 * WCAG 1.4.13 Content on Hover or Focus
 */
class ExpRsnPopup {
  constructor(triggerId, popupId, options = {}) {
    this.trigger = document.getElementById(triggerId);
    this.popup = document.getElementById(popupId);

    this.options = {
      placement: options.placement || 'bottom',
      trigger: options.trigger || 'click', // 'click', 'hover', 'focus'
      delay: options.delay || 0,
      offset: options.offset || 10,
      ...options
    };

    if (this.trigger && this.popup) {
      this.init();
    }
  }

  /**
   * Initialize popup
   */
  init() {
    // Set ARIA attributes
    this.trigger.setAttribute('aria-haspopup', 'true');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.popup.setAttribute('role', 'tooltip');

    // Set up event listeners based on trigger type
    if (this.options.trigger === 'click') {
      this.trigger.addEventListener('click', () => this.toggle());
    } else if (this.options.trigger === 'hover') {
      this.trigger.addEventListener('mouseenter', () => this.show());
      this.trigger.addEventListener('mouseleave', () => this.hide());
      this.popup.addEventListener('mouseenter', () => this.show());
      this.popup.addEventListener('mouseleave', () => this.hide());
    } else if (this.options.trigger === 'focus') {
      this.trigger.addEventListener('focus', () => this.show());
      this.trigger.addEventListener('blur', () => this.hide());
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }

  /**
   * Show popup
   */
  show() {
    if (this.options.delay) {
      setTimeout(() => this._show(), this.options.delay);
    } else {
      this._show();
    }
  }

  _show() {
    this.popup.classList.add('show');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.position();
  }

  /**
   * Hide popup
   */
  hide() {
    if (this.options.delay) {
      setTimeout(() => this._hide(), this.options.delay);
    } else {
      this._hide();
    }
  }

  _hide() {
    this.popup.classList.remove('show');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  /**
   * Toggle popup visibility
   */
  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if popup is visible
   * @returns {boolean} True if visible
   */
  isVisible() {
    return this.popup.classList.contains('show');
  }

  /**
   * Position popup relative to trigger
   */
  position() {
    const triggerRect = this.trigger.getBoundingClientRect();
    const popupRect = this.popup.getBoundingClientRect();

    let top, left;

    switch (this.options.placement) {
      case 'top':
        top = triggerRect.top - popupRect.height - this.options.offset;
        left = triggerRect.left + (triggerRect.width / 2) - (popupRect.width / 2);
        break;

      case 'bottom':
        top = triggerRect.bottom + this.options.offset;
        left = triggerRect.left + (triggerRect.width / 2) - (popupRect.width / 2);
        break;

      case 'left':
        top = triggerRect.top + (triggerRect.height / 2) - (popupRect.height / 2);
        left = triggerRect.left - popupRect.width - this.options.offset;
        break;

      case 'right':
        top = triggerRect.top + (triggerRect.height / 2) - (popupRect.height / 2);
        left = triggerRect.right + this.options.offset;
        break;
    }

    this.popup.style.position = 'fixed';
    this.popup.style.top = `${top}px`;
    this.popup.style.left = `${left}px`;
    this.popup.setAttribute('data-placement', this.options.placement);
  }
}

/**
 * Alert Manager
 * Handles dismissible alerts
 */
class ExpRsnAlert {
  constructor(alertId, options = {}) {
    this.alert = document.getElementById(alertId);
    this.options = {
      autoDismiss: options.autoDismiss || false,
      autoDismissDelay: options.autoDismissDelay || 5000,
      onDismiss: options.onDismiss || null,
      ...options
    };

    if (this.alert) {
      this.init();
    }
  }

  /**
   * Initialize alert
   */
  init() {
    // Set ARIA role
    this.alert.setAttribute('role', 'alert');
    this.alert.setAttribute('aria-live', 'polite');
    this.alert.setAttribute('aria-atomic', 'true');

    // Set up close button
    const closeButton = this.alert.querySelector('.alert-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.dismiss());
    }

    // Auto dismiss if enabled
    if (this.options.autoDismiss) {
      setTimeout(() => this.dismiss(), this.options.autoDismissDelay);
    }
  }

  /**
   * Dismiss alert
   */
  dismiss() {
    // Fade out animation
    this.alert.style.opacity = '0';
    this.alert.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
      this.alert.remove();

      if (this.options.onDismiss) {
        this.options.onDismiss();
      }
    }, 300);
  }

  /**
   * Show alert (if hidden)
   */
  show() {
    this.alert.style.display = 'block';
    this.alert.style.opacity = '1';
  }
}

/**
 * Table Sorter
 * WCAG 1.3.1 Info and Relationships
 */
class ExpRsnTableSort {
  constructor(tableId) {
    this.table = document.getElementById(tableId);
    this.headers = [];
    this.currentSort = { column: -1, direction: 'asc' };

    if (this.table) {
      this.init();
    }
  }

  /**
   * Initialize table sorting
   */
  init() {
    this.headers = Array.from(this.table.querySelectorAll('th.sortable'));

    this.headers.forEach((header, index) => {
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
      header.setAttribute('aria-sort', 'none');

      header.addEventListener('click', () => this.sort(index));
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.sort(index);
        }
      });
    });
  }

  /**
   * Sort table by column
   * @param {number} columnIndex - Column index to sort by
   */
  sort(columnIndex) {
    const header = this.headers[columnIndex];
    const tbody = this.table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Determine sort direction
    let direction = 'asc';
    if (this.currentSort.column === columnIndex && this.currentSort.direction === 'asc') {
      direction = 'desc';
    }

    // Sort rows
    rows.sort((a, b) => {
      const aCell = a.querySelectorAll('td')[columnIndex];
      const bCell = b.querySelectorAll('td')[columnIndex];

      const aValue = aCell.textContent.trim();
      const bValue = bCell.textContent.trim();

      // Try numeric comparison first
      const aNum = parseFloat(aValue);
      const bNum = parseFloat(bValue);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // String comparison
      return direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));

    // Update ARIA attributes
    this.headers.forEach((h, i) => {
      h.classList.remove('sorted-asc', 'sorted-desc');
      h.setAttribute('aria-sort', 'none');
    });

    header.classList.add(`sorted-${direction}`);
    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');

    // Update current sort
    this.currentSort = { column: columnIndex, direction };

    // Announce to screen readers
    this.announce(`Table sorted by ${header.textContent.trim()}, ${direction}ending order`);
  }

  /**
   * Announce message to screen readers
   * @param {string} message - Message to announce
   */
  announce(message) {
    let announcer = document.getElementById('table-sort-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'table-sort-announcer';
      announcer.className = 'sr-only';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }

    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = message;
    }, 100);
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExpRsnModal, ExpRsnPopup, ExpRsnAlert, ExpRsnTableSort };
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize modals with data-modal attribute
  const modals = document.querySelectorAll('[data-modal]');
  modals.forEach(modal => {
    const instance = new ExpRsnModal(modal.id);

    // Set up triggers
    const triggers = document.querySelectorAll(`[data-modal-target="${modal.id}"]`);
    triggers.forEach(trigger => {
      trigger.addEventListener('click', () => instance.open());
    });
  });

  // Initialize sortable tables
  const sortableTables = document.querySelectorAll('table.table-sortable');
  sortableTables.forEach(table => {
    new ExpRsnTableSort(table.id);
  });

  // Initialize alerts
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    new ExpRsnAlert(alert.id);
  });
});
