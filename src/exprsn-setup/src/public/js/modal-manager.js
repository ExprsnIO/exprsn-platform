/**
 * ═══════════════════════════════════════════════════════════════════════
 * Modal Manager
 * Unified modal system for CRUD operations with real-time updates
 * ═══════════════════════════════════════════════════════════════════════
 */

class ModalManager {
  constructor(options = {}) {
    this.options = {
      backdrop: true,
      keyboard: true,
      focus: true,
      ...options
    };

    this.activeModal = null;
    this.modals = new Map();

    // Initialize
    this.init();
  }

  /**
   * Initialize modal manager
   */
  init() {
    // Create modal container if it doesn't exist
    if (!document.getElementById('modal-container')) {
      const container = document.createElement('div');
      container.id = 'modal-container';
      document.body.appendChild(container);
    }

    // Add global event listeners
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.options.keyboard && this.activeModal) {
        this.close(this.activeModal.id);
      }
    });
  }

  /**
   * Create and show a modal
   */
  create(config) {
    const {
      id = `modal-${Date.now()}`,
      title,
      content,
      size = 'md', // sm, md, lg, xl
      buttons = [],
      onShow,
      onHide,
      onSubmit,
      backdrop = this.options.backdrop,
      keyboard = this.options.keyboard
    } = config;

    // Check if modal already exists
    if (this.modals.has(id)) {
      return this.show(id);
    }

    // Create modal HTML
    const modalHTML = `
      <div class="modal fade" id="${id}" tabindex="-1" role="dialog" aria-labelledby="${id}-title" aria-hidden="true" data-bs-backdrop="${backdrop ? 'true' : 'static'}" data-bs-keyboard="${keyboard}">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-${size}" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="${id}-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              ${typeof content === 'function' ? content() : content}
            </div>
            ${buttons.length > 0 ? `
              <div class="modal-footer">
                ${buttons.map(btn => `
                  <button type="button" class="btn btn-${btn.variant || 'primary'}" data-action="${btn.action || 'close'}">
                    ${btn.icon ? `<i class="${btn.icon}"></i> ` : ''}${btn.text}
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Add modal to container
    const container = document.getElementById('modal-container');
    container.insertAdjacentHTML('beforeend', modalHTML);

    // Get modal element
    const modalElement = document.getElementById(id);

    // Initialize Bootstrap modal
    const bsModal = new bootstrap.Modal(modalElement);

    // Store modal reference
    this.modals.set(id, {
      id,
      element: modalElement,
      bsModal,
      config,
      onShow,
      onHide,
      onSubmit
    });

    // Add event listeners
    modalElement.addEventListener('shown.bs.modal', () => {
      this.activeModal = this.modals.get(id);
      if (onShow) onShow(modalElement);

      // Focus first input
      if (this.options.focus) {
        const firstInput = modalElement.querySelector('input:not([type="hidden"]), textarea, select');
        if (firstInput) firstInput.focus();
      }
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      if (this.activeModal?.id === id) {
        this.activeModal = null;
      }
      if (onHide) onHide(modalElement);
    });

    // Add button click handlers
    modalElement.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        const action = button.dataset.action;

        if (action === 'close') {
          this.close(id);
        } else if (action === 'submit' && onSubmit) {
          e.preventDefault();
          const formData = this.getFormData(id);
          onSubmit(formData, modalElement);
        } else if (action.startsWith('custom:')) {
          const customAction = action.replace('custom:', '');
          if (config.customActions && config.customActions[customAction]) {
            config.customActions[customAction](modalElement);
          }
        }
      });
    });

    // Show modal
    bsModal.show();

    return { id, element: modalElement, bsModal };
  }

  /**
   * Show existing modal
   */
  show(id) {
    const modal = this.modals.get(id);
    if (!modal) {
      console.error(`Modal ${id} not found`);
      return;
    }

    modal.bsModal.show();
    return modal;
  }

  /**
   * Close modal
   */
  close(id) {
    const modal = this.modals.get(id);
    if (!modal) {
      console.error(`Modal ${id} not found`);
      return;
    }

    modal.bsModal.hide();
  }

  /**
   * Destroy modal
   */
  destroy(id) {
    const modal = this.modals.get(id);
    if (!modal) return;

    modal.bsModal.dispose();
    modal.element.remove();
    this.modals.delete(id);

    if (this.activeModal?.id === id) {
      this.activeModal = null;
    }
  }

  /**
   * Update modal content
   */
  updateContent(id, content) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const bodyElement = modal.element.querySelector('.modal-body');
    bodyElement.innerHTML = typeof content === 'function' ? content() : content;
  }

  /**
   * Update modal title
   */
  updateTitle(id, title) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const titleElement = modal.element.querySelector('.modal-title');
    titleElement.textContent = title;
  }

  /**
   * Get form data from modal
   */
  getFormData(id) {
    const modal = this.modals.get(id);
    if (!modal) return {};

    const form = modal.element.querySelector('form');
    if (!form) return {};

    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
      // Handle multiple values (checkboxes)
      if (data[key]) {
        if (!Array.isArray(data[key])) {
          data[key] = [data[key]];
        }
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    return data;
  }

  /**
   * Set form data in modal
   */
  setFormData(id, data) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const form = modal.element.querySelector('form');
    if (!form) return;

    Object.keys(data).forEach(key => {
      const input = form.querySelector(`[name="${key}"]`);
      if (!input) return;

      if (input.type === 'checkbox') {
        input.checked = !!data[key];
      } else if (input.type === 'radio') {
        const radio = form.querySelector(`[name="${key}"][value="${data[key]}"]`);
        if (radio) radio.checked = true;
      } else {
        input.value = data[key];
      }
    });
  }

  /**
   * Show loading state in modal
   */
  showLoading(id, message = 'Loading...') {
    const modal = this.modals.get(id);
    if (!modal) return;

    const buttons = modal.element.querySelectorAll('.modal-footer button');
    buttons.forEach(btn => btn.disabled = true);

    const bodyElement = modal.element.querySelector('.modal-body');
    bodyElement.style.opacity = '0.5';
    bodyElement.style.pointerEvents = 'none';

    // Add spinner
    if (!modal.element.querySelector('.modal-spinner')) {
      const spinner = document.createElement('div');
      spinner.className = 'modal-spinner text-center mt-3';
      spinner.innerHTML = `
        <div class="spinner-border spinner-border-sm" role="status">
          <span class="visually-hidden">${message}</span>
        </div>
        <p class="mt-2 text-muted">${message}</p>
      `;
      bodyElement.appendChild(spinner);
    }
  }

  /**
   * Hide loading state in modal
   */
  hideLoading(id) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const buttons = modal.element.querySelectorAll('.modal-footer button');
    buttons.forEach(btn => btn.disabled = false);

    const bodyElement = modal.element.querySelector('.modal-body');
    bodyElement.style.opacity = '1';
    bodyElement.style.pointerEvents = 'auto';

    // Remove spinner
    const spinner = modal.element.querySelector('.modal-spinner');
    if (spinner) spinner.remove();
  }

  /**
   * Show error in modal
   */
  showError(id, message) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const bodyElement = modal.element.querySelector('.modal-body');

    // Remove existing alerts
    bodyElement.querySelectorAll('.alert').forEach(alert => alert.remove());

    // Add error alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
      <i class="bi bi-exclamation-triangle-fill"></i> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    bodyElement.prepend(alert);
  }

  /**
   * Show success in modal
   */
  showSuccess(id, message) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const bodyElement = modal.element.querySelector('.modal-body');

    // Remove existing alerts
    bodyElement.querySelectorAll('.alert').forEach(alert => alert.remove());

    // Add success alert
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
      <i class="bi bi-check-circle-fill"></i> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    bodyElement.prepend(alert);

    // Auto-close after 3 seconds
    setTimeout(() => alert.remove(), 3000);
  }

  /**
   * Confirm action
   */
  confirm(config) {
    const {
      title = 'Confirm Action',
      message,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      variant = 'danger',
      onConfirm,
      onCancel
    } = config;

    return this.create({
      id: `confirm-${Date.now()}`,
      title,
      size: 'sm',
      content: `
        <div class="text-center py-3">
          <i class="bi bi-question-circle text-${variant}" style="font-size: 48px;"></i>
          <p class="mt-3 mb-0">${message}</p>
        </div>
      `,
      buttons: [
        {
          text: cancelText,
          variant: 'secondary',
          action: 'close'
        },
        {
          text: confirmText,
          variant,
          action: 'custom:confirm'
        }
      ],
      customActions: {
        confirm: (modal) => {
          if (onConfirm) onConfirm();
          this.close(modal.id);
          setTimeout(() => this.destroy(modal.id), 500);
        }
      },
      onHide: () => {
        if (onCancel) onCancel();
      }
    });
  }

  /**
   * Create entity modal (CRUD create)
   */
  createEntity(config) {
    const {
      entity,
      fields,
      onSubmit,
      title = `Create ${entity}`
    } = config;

    return this.create({
      id: `create-${entity}-${Date.now()}`,
      title,
      size: 'lg',
      content: () => {
        return `
          <form id="create-${entity}-form">
            ${this.generateFormFields(fields)}
          </form>
        `;
      },
      buttons: [
        {
          text: 'Cancel',
          variant: 'secondary',
          action: 'close'
        },
        {
          text: 'Create',
          variant: 'primary',
          icon: 'bi bi-plus-circle',
          action: 'submit'
        }
      ],
      onSubmit: async (formData, modal) => {
        this.showLoading(modal.id, 'Creating...');

        try {
          await onSubmit(formData);
          this.hideLoading(modal.id);
          this.showSuccess(modal.id, `${entity} created successfully`);
          setTimeout(() => {
            this.close(modal.id);
            setTimeout(() => this.destroy(modal.id), 500);
          }, 1500);
        } catch (error) {
          this.hideLoading(modal.id);
          this.showError(modal.id, error.message || `Failed to create ${entity}`);
        }
      }
    });
  }

  /**
   * Edit entity modal (CRUD update)
   */
  editEntity(config) {
    const {
      entity,
      entityId,
      fields,
      data,
      onSubmit,
      title = `Edit ${entity}`
    } = config;

    const modal = this.create({
      id: `edit-${entity}-${entityId}`,
      title,
      size: 'lg',
      content: () => {
        return `
          <form id="edit-${entity}-form">
            ${this.generateFormFields(fields)}
          </form>
        `;
      },
      buttons: [
        {
          text: 'Cancel',
          variant: 'secondary',
          action: 'close'
        },
        {
          text: 'Save Changes',
          variant: 'primary',
          icon: 'bi bi-save',
          action: 'submit'
        }
      ],
      onShow: () => {
        this.setFormData(modal.id, data);
      },
      onSubmit: async (formData, modalElement) => {
        this.showLoading(modal.id, 'Saving...');

        try {
          await onSubmit(formData);
          this.hideLoading(modal.id);
          this.showSuccess(modal.id, `${entity} updated successfully`);
          setTimeout(() => {
            this.close(modal.id);
            setTimeout(() => this.destroy(modal.id), 500);
          }, 1500);
        } catch (error) {
          this.hideLoading(modal.id);
          this.showError(modal.id, error.message || `Failed to update ${entity}`);
        }
      }
    });

    return modal;
  }

  /**
   * Delete entity confirmation
   */
  deleteEntity(config) {
    const {
      entity,
      entityId,
      entityName,
      onConfirm
    } = config;

    return this.confirm({
      title: `Delete ${entity}`,
      message: `Are you sure you want to delete "${entityName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
      onConfirm
    });
  }

  /**
   * Generate form fields HTML
   */
  generateFormFields(fields) {
    return fields.map(field => {
      const {
        name,
        label,
        type = 'text',
        required = false,
        placeholder = '',
        help = '',
        options = [],
        value = '',
        rows = 3
      } = field;

      const requiredAttr = required ? 'required' : '';
      const requiredLabel = required ? '<span class="text-danger">*</span>' : '';

      switch (type) {
        case 'textarea':
          return `
            <div class="mb-3">
              <label for="${name}" class="form-label">${label} ${requiredLabel}</label>
              <textarea class="form-control" id="${name}" name="${name}" rows="${rows}" placeholder="${placeholder}" ${requiredAttr}>${value}</textarea>
              ${help ? `<div class="form-text">${help}</div>` : ''}
            </div>
          `;

        case 'select':
          return `
            <div class="mb-3">
              <label for="${name}" class="form-label">${label} ${requiredLabel}</label>
              <select class="form-select" id="${name}" name="${name}" ${requiredAttr}>
                <option value="">Select...</option>
                ${options.map(opt => `
                  <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
                    ${opt.label}
                  </option>
                `).join('')}
              </select>
              ${help ? `<div class="form-text">${help}</div>` : ''}
            </div>
          `;

        case 'checkbox':
          return `
            <div class="mb-3 form-check">
              <input type="checkbox" class="form-check-input" id="${name}" name="${name}" ${value ? 'checked' : ''}>
              <label class="form-check-label" for="${name}">
                ${label} ${requiredLabel}
              </label>
              ${help ? `<div class="form-text">${help}</div>` : ''}
            </div>
          `;

        default:
          return `
            <div class="mb-3">
              <label for="${name}" class="form-label">${label} ${requiredLabel}</label>
              <input type="${type}" class="form-control" id="${name}" name="${name}" value="${value}" placeholder="${placeholder}" ${requiredAttr}>
              ${help ? `<div class="form-text">${help}</div>` : ''}
            </div>
          `;
      }
    }).join('');
  }
}

// Export global instance
window.modalManager = new ModalManager();
