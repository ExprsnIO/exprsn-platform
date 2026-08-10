/**
 * Section Renderer
 * Dynamically renders configuration sections based on data structure
 */

class SectionRenderer {
  constructor(containerEl) {
    this.container = containerEl;
  }

  /**
   * Render a section based on its data
   */
  render(sectionId, data) {
    this.container.innerHTML = '';

    if (data.error) {
      this.renderError(data.error, data.placeholder);
      data = data.placeholder || {};
    }

    // Render based on data structure
    if (data.fields) {
      this.renderForm(sectionId, data);
    } else if (data.table) {
      this.renderTable(sectionId, data);
    } else if (data.stats) {
      this.renderStats(data);
    } else if (data.services) {
      this.renderServices(data);
    } else {
      this.renderGeneric(sectionId, data);
    }
  }

  /**
   * Render error message
   */
  renderError(message, hasPlaceholder) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-warning mb-3';
    alert.innerHTML = `
      <i class="bi bi-exclamation-triangle me-2"></i>
      <strong>Service Unavailable:</strong> ${message}
      ${hasPlaceholder ? '<br><small>Showing configuration template. Changes will be saved when service is available.</small>' : ''}
    `;
    this.container.appendChild(alert);
  }

  /**
   * Render form-based configuration
   */
  renderForm(sectionId, data) {
    const card = document.createElement('div');
    card.className = 'config-card';

    let html = `
      <div class="card-title">
        <span>${data.title || 'Configuration'}</span>
      </div>
    `;

    if (data.description) {
      html += `<p class="card-subtitle">${data.description}</p>`;
    }

    html += '<form id="config-form" class="needs-validation" novalidate>';

    // Render form fields
    data.fields.forEach(field => {
      html += this.renderFormField(field);
    });

    html += `
      <div class="mt-4">
        <button type="submit" class="btn btn-primary">
          <i class="bi bi-check-lg me-2"></i>Save Configuration
        </button>
        <button type="button" class="btn btn-secondary ms-2" onclick="window.location.reload()">
          <i class="bi bi-arrow-clockwise me-2"></i>Reset
        </button>
      </div>
    `;

    html += '</form>';
    card.innerHTML = html;
    this.container.appendChild(card);

    // Add form submit handler
    const form = document.getElementById('config-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit(sectionId, form, data.fields);
    });
  }

  /**
   * Render individual form field
   */
  renderFormField(field) {
    let html = '<div class="form-group">';
    html += `<label class="form-label" for="${field.name}">${field.label}</label>`;

    switch (field.type) {
      case 'text':
      case 'password':
      case 'email':
      case 'number':
        html += `
          <input
            type="${field.type}"
            class="form-control"
            id="${field.name}"
            name="${field.name}"
            value="${field.value || ''}"
            ${field.required ? 'required' : ''}
            ${field.min !== undefined ? `min="${field.min}"` : ''}
            ${field.max !== undefined ? `max="${field.max}"` : ''}
          >
        `;
        break;

      case 'textarea':
        html += `
          <textarea
            class="form-control"
            id="${field.name}"
            name="${field.name}"
            rows="${field.rows || 3}"
            ${field.required ? 'required' : ''}
          >${field.value || ''}</textarea>
        `;
        break;

      case 'select':
        html += `<select class="form-select" id="${field.name}" name="${field.name}">`;
        (field.options || []).forEach(option => {
          const selected = option === field.value ? 'selected' : '';
          html += `<option value="${option}" ${selected}>${option}</option>`;
        });
        html += '</select>';
        break;

      case 'checkbox':
        html += `
          <div class="form-check form-switch">
            <input
              class="form-check-input"
              type="checkbox"
              id="${field.name}"
              name="${field.name}"
              ${field.value ? 'checked' : ''}
            >
            <label class="form-check-label" for="${field.name}">
              ${field.checkboxLabel || 'Enable'}
            </label>
          </div>
        `;
        break;

      case 'radio':
        (field.options || []).forEach(option => {
          const checked = option === field.value ? 'checked' : '';
          html += `
            <div class="form-check">
              <input
                class="form-check-input"
                type="radio"
                name="${field.name}"
                id="${field.name}_${option}"
                value="${option}"
                ${checked}
              >
              <label class="form-check-label" for="${field.name}_${option}">
                ${option}
              </label>
            </div>
          `;
        });
        break;
    }

    if (field.help) {
      html += `<div class="form-text">${field.help}</div>`;
    }

    html += '</div>';
    return html;
  }

  /**
   * Render table-based data
   */
  renderTable(sectionId, data) {
    const card = document.createElement('div');
    card.className = 'config-card';

    let html = `
      <div class="card-title">
        <span>${data.title || 'Data'}</span>
        ${this.renderActions(data.actions)}
      </div>
    `;

    if (data.description) {
      html += `<p class="card-subtitle">${data.description}</p>`;
    }

    html += '<div class="table-responsive">';
    html += '<table class="config-table table">';

    // Table header
    html += '<thead><tr>';
    (data.table.headers || []).forEach(header => {
      html += `<th>${header}</th>`;
    });
    html += '</tr></thead>';

    // Table body
    html += '<tbody>';
    if (data.table.rows && data.table.rows.length > 0) {
      data.table.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
          html += `<td>${cell}</td>`;
        });
        html += '</tr>';
      });
    } else {
      html += `
        <tr>
          <td colspan="${data.table.headers.length}" class="text-center text-muted py-4">
            No data available
          </td>
        </tr>
      `;
    }
    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    card.innerHTML = html;
    this.container.appendChild(card);
  }

  /**
   * Render action buttons
   */
  renderActions(actions) {
    if (!actions || actions.length === 0) return '';

    let html = '<div class="btn-group btn-group-sm">';
    actions.forEach(action => {
      html += `
        <button class="btn btn-outline-primary" onclick="handleAction('${action}')">
          <i class="bi bi-plus me-1"></i>${action}
        </button>
      `;
    });
    html += '</div>';
    return html;
  }

  /**
   * Render statistics dashboard
   */
  renderStats(data) {
    // Already handled in the main dashboard HTML
    // This is for additional stats sections
  }

  /**
   * Render services list
   */
  renderServices(data) {
    const card = document.createElement('div');
    card.className = 'config-card';

    let html = `
      <div class="card-title">
        <span>Service Status</span>
        <button class="btn btn-sm btn-outline-primary" onclick="refreshServices()">
          <i class="bi bi-arrow-clockwise"></i> Refresh
        </button>
      </div>
    `;

    html += '<div class="row">';
    (data.services || []).forEach(service => {
      const statusClass = service.status === 'running' ? 'success' : 'danger';
      html += `
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="card">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="card-title mb-1">${service.name}</h6>
                  <small class="text-muted">Port ${service.port}</small>
                </div>
                <span class="badge badge-${statusClass}">
                  ${service.status}
                </span>
              </div>
              ${service.health ? `
                <div class="mt-2 small">
                  <div class="text-muted">
                    <i class="bi bi-clock me-1"></i>
                    Uptime: ${this.formatUptime(service.health.uptime || 0)}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    card.innerHTML = html;
    this.container.appendChild(card);
  }

  /**
   * Render generic section
   */
  renderGeneric(sectionId, data) {
    const card = document.createElement('div');
    card.className = 'config-card';

    card.innerHTML = `
      <div class="card-title">
        <span>${data.title || sectionId}</span>
      </div>
      <p class="card-subtitle">
        ${data.description || 'Configuration section'}
      </p>
      <div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>
        This section is under development. Configuration options will be available soon.
      </div>
    `;

    this.container.appendChild(card);
  }

  /**
   * Handle form submission
   */
  async handleFormSubmit(sectionId, form, fields) {
    const formData = new FormData(form);
    const config = {};

    fields.forEach(field => {
      if (field.type === 'checkbox') {
        config[field.name] = formData.has(field.name);
      } else if (field.type === 'number') {
        config[field.name] = parseFloat(formData.get(field.name));
      } else {
        config[field.name] = formData.get(field.name);
      }
    });

    try {
      await window.saveConfig(sectionId, config);
    } catch (error) {
      console.error('Error saving configuration:', error);
    }
  }

  /**
   * Format uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

// Global action handler
window.handleAction = function(action) {
  console.log('Action triggered:', action);
  alert(`Action "${action}" is under development`);
};

// Global refresh handler
window.refreshServices = function() {
  window.navigateTo('services');
};

// Export for use in main dashboard
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SectionRenderer;
}
