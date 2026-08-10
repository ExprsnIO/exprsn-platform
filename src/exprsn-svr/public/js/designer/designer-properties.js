/**
 * SVR Visual Designer - Property Editor
 * Dynamic property and style editing for selected elements
 */

class PropertyEditor {
  constructor() {
    this.currentElement = null;
    this.propertiesPanel = document.getElementById('propertiesPanel');
    this.stylesPanel = document.getElementById('stylesPanel');

    this.init();
  }

  /**
   * Initialize property editor
   */
  init() {
    console.log('[Property Editor] Initializing...');

    // Listen for element selection
    document.addEventListener('element-selected', (e) => {
      this.showProperties(e.detail.element);
      this.showStyles(e.detail.element);
    });

    document.addEventListener('element-deselected', () => {
      this.showNoSelection();
    });

    console.log('[Property Editor] Initialized');
  }

  /**
   * Show properties for selected element
   * @param {HTMLElement} element - Selected element
   */
  showProperties(element) {
    this.currentElement = element;

    const type = element.getAttribute('data-component-type');
    const component = ComponentLibrary.getComponent(type);
    const properties = JSON.parse(element.getAttribute('data-properties') || '{}');

    let html = '';

    // Component info
    html += `<div class="property-group">
      <h6>Component: ${component ? component.name : type}</h6>
    </div>`;

    // Common properties
    html += this.renderPropertyGroup('Content', this.getContentProperties(type, properties));

    // Layout properties (if droppable)
    if (component && component.droppable) {
      html += this.renderPropertyGroup('Layout', this.getLayoutProperties(type, properties));
    }

    // Specific properties based on type
    const specificProps = this.getSpecificProperties(type, properties);
    if (specificProps.length > 0) {
      html += this.renderPropertyGroup('Properties', specificProps);
    }

    this.propertiesPanel.innerHTML = html;

    // Bind change handlers
    this.bindPropertyHandlers();
  }

  /**
   * Get content properties
   * @param {string} type - Component type
   * @param {object} properties - Current properties
   * @returns {array} - Property inputs
   */
  getContentProperties(type, properties) {
    const props = [];

    // Text content
    if (['heading', 'paragraph', 'text', 'button', 'link'].includes(type)) {
      props.push({
        name: 'text',
        label: 'Text',
        type: 'text',
        value: properties.text || ''
      });
    }

    // HTML content
    if (type === 'paragraph') {
      props.push({
        name: 'html',
        label: 'HTML',
        type: 'textarea',
        value: this.currentElement.innerHTML
      });
    }

    // Class
    props.push({
      name: 'class',
      label: 'CSS Class',
      type: 'text',
      value: properties.class || ''
    });

    return props;
  }

  /**
   * Get layout properties
   * @param {string} type - Component type
   * @param {object} properties - Current properties
   * @returns {array} - Property inputs
   */
  getLayoutProperties(type, properties) {
    return [];
  }

  /**
   * Get specific properties for component type
   * @param {string} type - Component type
   * @param {object} properties - Current properties
   * @returns {array} - Property inputs
   */
  getSpecificProperties(type, properties) {
    const props = [];

    // Link properties
    if (type === 'link') {
      props.push({
        name: 'href',
        label: 'URL',
        type: 'text',
        value: properties.href || '#'
      });
      props.push({
        name: 'target',
        label: 'Target',
        type: 'select',
        options: ['_self', '_blank', '_parent', '_top'],
        value: properties.target || '_self'
      });
    }

    // Image properties
    if (type === 'image') {
      props.push({
        name: 'src',
        label: 'Image URL',
        type: 'text',
        value: properties.src || ''
      });
      props.push({
        name: 'alt',
        label: 'Alt Text',
        type: 'text',
        value: properties.alt || ''
      });
    }

    // Form input properties
    if (['input', 'textarea', 'select'].includes(type)) {
      props.push({
        name: 'name',
        label: 'Name',
        type: 'text',
        value: properties.name || ''
      });
      props.push({
        name: 'placeholder',
        label: 'Placeholder',
        type: 'text',
        value: properties.placeholder || ''
      });
      props.push({
        name: 'required',
        label: 'Required',
        type: 'checkbox',
        value: properties.required || false
      });
    }

    // Button properties
    if (type === 'button') {
      props.push({
        name: 'type',
        label: 'Type',
        type: 'select',
        options: ['button', 'submit', 'reset'],
        value: properties.type || 'button'
      });
      props.push({
        name: 'variant',
        label: 'Variant',
        type: 'select',
        options: ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'],
        value: properties.variant || 'primary'
      });
    }

    // Heading level
    if (type === 'heading') {
      props.push({
        name: 'level',
        label: 'Level',
        type: 'select',
        options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        value: properties.level || 'h2'
      });
    }

    // Column size
    if (type === 'column') {
      props.push({
        name: 'size',
        label: 'Size',
        type: 'select',
        options: ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        value: properties.size || 'auto'
      });
    }

    return props;
  }

  /**
   * Render property group
   * @param {string} title - Group title
   * @param {array} properties - Properties array
   * @returns {string} - HTML string
   */
  renderPropertyGroup(title, properties) {
    if (properties.length === 0) return '';

    let html = `<div class="property-group"><h6>${title}</h6>`;

    properties.forEach(prop => {
      html += this.renderPropertyInput(prop);
    });

    html += '</div>';
    return html;
  }

  /**
   * Render property input
   * @param {object} prop - Property configuration
   * @returns {string} - HTML string
   */
  renderPropertyInput(prop) {
    let html = '<div class="property-row">';
    html += `<label class="property-label">${prop.label}</label>`;
    html += '<div class="property-input">';

    switch (prop.type) {
      case 'text':
        html += `<input type="text" class="form-control form-control-sm" name="${prop.name}" value="${this.escapeHtml(prop.value)}">`;
        break;

      case 'textarea':
        html += `<textarea class="form-control form-control-sm" name="${prop.name}" rows="3">${this.escapeHtml(prop.value)}</textarea>`;
        break;

      case 'select':
        html += `<select class="form-select form-select-sm" name="${prop.name}">`;
        prop.options.forEach(opt => {
          const selected = opt === prop.value ? 'selected' : '';
          html += `<option value="${opt}" ${selected}>${opt}</option>`;
        });
        html += '</select>';
        break;

      case 'checkbox':
        const checked = prop.value ? 'checked' : '';
        html += `<div class="form-check"><input type="checkbox" class="form-check-input" name="${prop.name}" ${checked}></div>`;
        break;

      case 'color':
        html += `<input type="color" class="form-control form-control-sm form-control-color" name="${prop.name}" value="${prop.value}">`;
        break;

      default:
        html += `<input type="text" class="form-control form-control-sm" name="${prop.name}" value="${prop.value}">`;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * Show styles for selected element
   * @param {HTMLElement} element - Selected element
   */
  showStyles(element) {
    this.currentElement = element;

    const styles = JSON.parse(element.getAttribute('data-styles') || '{}');
    const computedStyles = window.getComputedStyle(element);

    let html = '';

    // Render each style group
    DesignerConfig.styleProperties.forEach(group => {
      html += this.renderStyleGroup(group, styles, computedStyles);
    });

    this.stylesPanel.innerHTML = html;

    // Bind change handlers
    this.bindStyleHandlers();
  }

  /**
   * Render style group
   * @param {object} group - Style group
   * @param {object} styles - Current styles
   * @param {CSSStyleDeclaration} computedStyles - Computed styles
   * @returns {string} - HTML string
   */
  renderStyleGroup(group, styles, computedStyles) {
    let html = `<div class="style-group"><h6>${group.group}</h6>`;

    group.properties.forEach(prop => {
      const value = styles[prop.name] || computedStyles[prop.name] || '';
      html += this.renderStyleInput(prop, value);
    });

    html += '</div>';
    return html;
  }

  /**
   * Render style input
   * @param {object} prop - Style property
   * @param {string} value - Current value
   * @returns {string} - HTML string
   */
  renderStyleInput(prop, value) {
    let html = '<div class="property-row">';
    html += `<label class="property-label">${prop.label}</label>`;
    html += '<div class="property-input">';

    switch (prop.type) {
      case 'text':
        html += `<input type="text" class="form-control form-control-sm style-input" data-property="${prop.name}" value="${value}">`;
        break;

      case 'select':
        html += `<select class="form-select form-select-sm style-input" data-property="${prop.name}">`;
        prop.options.forEach(opt => {
          const selected = opt === value ? 'selected' : '';
          html += `<option value="${opt}" ${selected}>${opt}</option>`;
        });
        html += '</select>';
        break;

      case 'color':
        html += `<div class="color-picker-wrapper">`;
        html += `<div class="color-preview" style="background-color: ${value || '#ffffff'}"></div>`;
        html += `<input type="color" class="form-control form-control-sm form-control-color style-input" data-property="${prop.name}" value="${value || '#000000'}">`;
        html += '</div>';
        break;

      case 'range':
        html += `<input type="range" class="form-range style-input" data-property="${prop.name}" min="${prop.min}" max="${prop.max}" step="${prop.step}" value="${value || prop.min}">`;
        html += `<span class="range-value">${value}</span>`;
        break;

      case 'spacing':
        html += this.renderSpacingInput(prop.name, value);
        break;

      default:
        html += `<input type="text" class="form-control form-control-sm style-input" data-property="${prop.name}" value="${value}">`;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * Render spacing input (margin, padding)
   * @param {string} property - Property name
   * @param {string} value - Current value
   * @returns {string} - HTML string
   */
  renderSpacingInput(property, value) {
    // Parse value (e.g., "10px 20px 10px 20px")
    const values = value.split(' ');
    const top = values[0] || '0';
    const right = values[1] || values[0] || '0';
    const bottom = values[2] || values[0] || '0';
    const left = values[3] || values[1] || values[0] || '0';

    return `
      <div class="spacing-grid">
        <input type="text" class="form-control form-control-sm spacing-input" data-side="top" placeholder="Top" value="${top}">
        <input type="text" class="form-control form-control-sm spacing-input" data-side="right" placeholder="Right" value="${right}">
        <input type="text" class="form-control form-control-sm spacing-input" data-side="bottom" placeholder="Bottom" value="${bottom}">
        <input type="text" class="form-control form-control-sm spacing-input" data-side="left" placeholder="Left" value="${left}">
      </div>
    `;
  }

  /**
   * Bind property change handlers
   */
  bindPropertyHandlers() {
    this.propertiesPanel.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('change', (e) => {
        const name = e.target.getAttribute('name');
        let value = e.target.value;

        if (e.target.type === 'checkbox') {
          value = e.target.checked;
        }

        this.updateProperty(name, value);
      });
    });
  }

  /**
   * Bind style change handlers
   */
  bindStyleHandlers() {
    this.stylesPanel.querySelectorAll('.style-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const property = e.target.getAttribute('data-property');
        const value = e.target.value;

        this.updateStyle(property, value);

        // Update range value display
        if (e.target.type === 'range') {
          const valueSpan = e.target.parentElement.querySelector('.range-value');
          if (valueSpan) {
            valueSpan.textContent = value;
          }
        }

        // Update color preview
        if (e.target.type === 'color') {
          const preview = e.target.parentElement.querySelector('.color-preview');
          if (preview) {
            preview.style.backgroundColor = value;
          }
        }
      });
    });

    // Spacing inputs
    this.stylesPanel.querySelectorAll('.spacing-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const row = e.target.closest('.property-row');
        const label = row.querySelector('.property-label').textContent.toLowerCase();
        const property = label; // margin or padding

        const inputs = row.querySelectorAll('.spacing-input');
        const top = inputs[0].value || '0';
        const right = inputs[1].value || top;
        const bottom = inputs[2].value || top;
        const left = inputs[3].value || right;

        const value = `${top} ${right} ${bottom} ${left}`;
        this.updateStyle(property, value);
      });
    });
  }

  /**
   * Update element property
   * @param {string} name - Property name
   * @param {*} value - Property value
   */
  updateProperty(name, value) {
    if (!this.currentElement) return;

    const type = this.currentElement.getAttribute('data-component-type');
    const properties = JSON.parse(this.currentElement.getAttribute('data-properties') || '{}');

    // Update properties object
    properties[name] = value;

    // Apply to element
    ComponentLibrary.applyProperties(this.currentElement, type, properties);

    // Special handling for heading level
    if (name === 'level' && type === 'heading') {
      const newElement = document.createElement(value);
      newElement.innerHTML = this.currentElement.innerHTML;
      Array.from(this.currentElement.attributes).forEach(attr => {
        newElement.setAttribute(attr.name, attr.value);
      });
      this.currentElement.replaceWith(newElement);
      this.currentElement = newElement;
    }

    // Trigger change event
    const event = new CustomEvent('property-changed', {
      detail: { element: this.currentElement, property: name, value }
    });
    document.dispatchEvent(event);

    console.log('[Property Editor] Updated property:', name, '=', value);
  }

  /**
   * Update element style
   * @param {string} property - CSS property
   * @param {string} value - CSS value
   */
  updateStyle(property, value) {
    if (!this.currentElement) return;

    const styles = JSON.parse(this.currentElement.getAttribute('data-styles') || '{}');

    // Update styles object
    styles[property] = value;

    // Apply to element
    this.currentElement.style[property] = value;

    // Update data attribute
    this.currentElement.setAttribute('data-styles', JSON.stringify(styles));

    // Trigger change event
    const event = new CustomEvent('style-changed', {
      detail: { element: this.currentElement, property, value }
    });
    document.dispatchEvent(event);

    console.log('[Property Editor] Updated style:', property, '=', value);
  }

  /**
   * Show no selection message
   */
  showNoSelection() {
    this.currentElement = null;

    const message = `
      <div class="no-selection">
        <i class="fas fa-mouse-pointer"></i>
        <p>Select an element to edit properties</p>
      </div>
    `;

    this.propertiesPanel.innerHTML = message;
    this.stylesPanel.innerHTML = message;
  }

  /**
   * Escape HTML
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current element
   * @returns {HTMLElement|null} - Current element
   */
  getCurrentElement() {
    return this.currentElement;
  }
}

// Make globally accessible
window.PropertyEditor = PropertyEditor;

console.log('[Property Editor] Module loaded');
