/**
 * SVR Visual Designer - Component Library
 * Component definitions, templates, and management
 */

const ComponentLibrary = {
  // Component definitions
  components: {
    // ========== Layout Components ==========
    container: {
      name: 'Container',
      category: 'layout',
      icon: 'fa-square',
      html: '<div class="container"></div>',
      editable: true,
      droppable: true,
      properties: {
        class: 'container',
        fluid: false
      },
      styles: {
        padding: '20px',
        margin: '0 auto'
      }
    },

    row: {
      name: 'Row',
      category: 'layout',
      icon: 'fa-grip-horizontal',
      html: '<div class="row"></div>',
      editable: true,
      droppable: true,
      properties: {
        class: 'row'
      },
      styles: {
        display: 'flex',
        flexWrap: 'wrap'
      }
    },

    column: {
      name: 'Column',
      category: 'layout',
      icon: 'fa-columns',
      html: '<div class="col"></div>',
      editable: true,
      droppable: true,
      properties: {
        class: 'col',
        size: 'auto'
      },
      styles: {
        padding: '15px'
      }
    },

    section: {
      name: 'Section',
      category: 'layout',
      icon: 'fa-window-maximize',
      html: '<section class="section-block"></section>',
      editable: true,
      droppable: true,
      properties: {
        class: 'section-block'
      },
      styles: {
        padding: '60px 0',
        minHeight: '200px'
      }
    },

    divider: {
      name: 'Divider',
      category: 'layout',
      icon: 'fa-minus',
      html: '<hr class="divider">',
      editable: false,
      droppable: false,
      properties: {
        class: 'divider'
      },
      styles: {
        margin: '20px 0',
        border: '1px solid #dee2e6'
      }
    },

    spacer: {
      name: 'Spacer',
      category: 'layout',
      icon: 'fa-arrows-alt-v',
      html: '<div class="spacer"></div>',
      editable: false,
      droppable: false,
      properties: {
        class: 'spacer',
        height: '40px'
      },
      styles: {
        height: '40px',
        width: '100%'
      }
    },

    // ========== Typography Components ==========
    heading: {
      name: 'Heading',
      category: 'typography',
      icon: 'fa-heading',
      html: '<h2>Heading Text</h2>',
      editable: true,
      droppable: false,
      properties: {
        text: 'Heading Text',
        level: 'h2',
        class: ''
      },
      styles: {
        fontSize: '32px',
        fontWeight: 'bold',
        margin: '0 0 16px 0'
      }
    },

    paragraph: {
      name: 'Paragraph',
      category: 'typography',
      icon: 'fa-paragraph',
      html: '<p>This is a paragraph of text. Edit this content to customize your page.</p>',
      editable: true,
      droppable: false,
      properties: {
        text: 'This is a paragraph of text. Edit this content to customize your page.',
        class: ''
      },
      styles: {
        fontSize: '16px',
        lineHeight: '1.6',
        margin: '0 0 16px 0'
      }
    },

    text: {
      name: 'Text',
      category: 'typography',
      icon: 'fa-font',
      html: '<span>Text</span>',
      editable: true,
      droppable: false,
      properties: {
        text: 'Text',
        class: ''
      },
      styles: {
        fontSize: '14px'
      }
    },

    link: {
      name: 'Link',
      category: 'typography',
      icon: 'fa-link',
      html: '<a href="#" target="_self">Link Text</a>',
      editable: true,
      droppable: false,
      properties: {
        text: 'Link Text',
        href: '#',
        target: '_self',
        class: ''
      },
      styles: {
        color: '#0d6efd',
        textDecoration: 'underline'
      }
    },

    list: {
      name: 'List',
      category: 'typography',
      icon: 'fa-list',
      html: '<ul><li>List item 1</li><li>List item 2</li><li>List item 3</li></ul>',
      editable: true,
      droppable: false,
      properties: {
        type: 'ul',
        class: ''
      },
      styles: {
        margin: '0 0 16px 0',
        paddingLeft: '20px'
      }
    },

    // ========== Form Components ==========
    form: {
      name: 'Form',
      category: 'forms',
      icon: 'fa-wpforms',
      html: '<form></form>',
      editable: true,
      droppable: true,
      properties: {
        action: '',
        method: 'POST',
        class: ''
      },
      styles: {
        padding: '20px',
        background: '#f8f9fa',
        borderRadius: '8px'
      }
    },

    input: {
      name: 'Input',
      category: 'forms',
      icon: 'fa-keyboard',
      html: '<input type="text" class="form-control" placeholder="Enter text">',
      editable: true,
      droppable: false,
      properties: {
        type: 'text',
        name: '',
        placeholder: 'Enter text',
        value: '',
        required: false,
        class: 'form-control'
      },
      styles: {
        width: '100%',
        padding: '8px 12px',
        marginBottom: '16px'
      }
    },

    textarea: {
      name: 'Textarea',
      category: 'forms',
      icon: 'fa-align-left',
      html: '<textarea class="form-control" rows="4" placeholder="Enter text"></textarea>',
      editable: true,
      droppable: false,
      properties: {
        name: '',
        placeholder: 'Enter text',
        rows: 4,
        required: false,
        class: 'form-control'
      },
      styles: {
        width: '100%',
        padding: '8px 12px',
        marginBottom: '16px'
      }
    },

    select: {
      name: 'Select',
      category: 'forms',
      icon: 'fa-caret-square-down',
      html: '<select class="form-select"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select>',
      editable: true,
      droppable: false,
      properties: {
        name: '',
        required: false,
        class: 'form-select'
      },
      styles: {
        width: '100%',
        padding: '8px 12px',
        marginBottom: '16px'
      }
    },

    checkbox: {
      name: 'Checkbox',
      category: 'forms',
      icon: 'fa-check-square',
      html: '<div class="form-check"><input type="checkbox" class="form-check-input" id="check1"><label class="form-check-label" for="check1">Checkbox Label</label></div>',
      editable: true,
      droppable: false,
      properties: {
        name: '',
        label: 'Checkbox Label',
        checked: false,
        class: 'form-check'
      },
      styles: {
        marginBottom: '12px'
      }
    },

    radio: {
      name: 'Radio',
      category: 'forms',
      icon: 'fa-dot-circle',
      html: '<div class="form-check"><input type="radio" class="form-check-input" name="radio1" id="radio1"><label class="form-check-label" for="radio1">Radio Label</label></div>',
      editable: true,
      droppable: false,
      properties: {
        name: 'radio1',
        label: 'Radio Label',
        checked: false,
        class: 'form-check'
      },
      styles: {
        marginBottom: '12px'
      }
    },

    // ========== UI Components ==========
    button: {
      name: 'Button',
      category: 'ui',
      icon: 'fa-hand-pointer',
      html: '<button type="button" class="btn btn-primary">Button</button>',
      editable: true,
      droppable: false,
      properties: {
        text: 'Button',
        type: 'button',
        variant: 'primary',
        class: 'btn btn-primary'
      },
      styles: {
        padding: '10px 24px',
        fontSize: '16px',
        borderRadius: '6px'
      }
    },

    image: {
      name: 'Image',
      category: 'ui',
      icon: 'fa-image',
      html: '<img src="https://via.placeholder.com/400x300" alt="Image" class="img-fluid">',
      editable: true,
      droppable: false,
      properties: {
        src: 'https://via.placeholder.com/400x300',
        alt: 'Image',
        class: 'img-fluid'
      },
      styles: {
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '8px'
      }
    },

    video: {
      name: 'Video',
      category: 'ui',
      icon: 'fa-video',
      html: '<video controls class="video-fluid"><source src="" type="video/mp4">Your browser does not support the video tag.</video>',
      editable: true,
      droppable: false,
      properties: {
        src: '',
        controls: true,
        autoplay: false,
        loop: false,
        class: 'video-fluid'
      },
      styles: {
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '8px'
      }
    },

    icon: {
      name: 'Icon',
      category: 'ui',
      icon: 'fa-icons',
      html: '<i class="fas fa-star"></i>',
      editable: true,
      droppable: false,
      properties: {
        icon: 'fa-star',
        class: 'fas fa-star'
      },
      styles: {
        fontSize: '24px',
        color: '#212529'
      }
    },

    card: {
      name: 'Card',
      category: 'ui',
      icon: 'fa-id-card',
      html: '<div class="card"><div class="card-body"><h5 class="card-title">Card Title</h5><p class="card-text">Card content goes here.</p></div></div>',
      editable: true,
      droppable: true,
      properties: {
        title: 'Card Title',
        text: 'Card content goes here.',
        class: 'card'
      },
      styles: {
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        marginBottom: '20px'
      }
    },

    alert: {
      name: 'Alert',
      category: 'ui',
      icon: 'fa-exclamation-triangle',
      html: '<div class="alert alert-info" role="alert">This is an alert message.</div>',
      editable: true,
      droppable: false,
      properties: {
        text: 'This is an alert message.',
        variant: 'info',
        class: 'alert alert-info'
      },
      styles: {
        padding: '12px 20px',
        borderRadius: '6px',
        marginBottom: '16px'
      }
    },

    badge: {
      name: 'Badge',
      category: 'ui',
      icon: 'fa-certificate',
      html: '<span class="badge bg-primary">Badge</span>',
      editable: true,
      droppable: false,
      properties: {
        text: 'Badge',
        variant: 'primary',
        class: 'badge bg-primary'
      },
      styles: {
        padding: '4px 8px',
        fontSize: '12px',
        borderRadius: '4px'
      }
    },

    progress: {
      name: 'Progress Bar',
      category: 'ui',
      icon: 'fa-tasks',
      html: '<div class="progress"><div class="progress-bar" role="progressbar" style="width: 50%">50%</div></div>',
      editable: true,
      droppable: false,
      properties: {
        value: 50,
        max: 100,
        variant: 'primary',
        class: 'progress'
      },
      styles: {
        height: '24px',
        borderRadius: '6px',
        marginBottom: '16px'
      }
    },

    // ========== Navigation Components ==========
    navbar: {
      name: 'Navbar',
      category: 'navigation',
      icon: 'fa-bars',
      html: '<nav class="navbar navbar-expand-lg navbar-light bg-light"><div class="container-fluid"><a class="navbar-brand" href="#">Brand</a><button class="navbar-toggler" type="button"><span class="navbar-toggler-icon"></span></button><div class="collapse navbar-collapse"><ul class="navbar-nav"><li class="nav-item"><a class="nav-link" href="#">Home</a></li><li class="nav-item"><a class="nav-link" href="#">About</a></li></ul></div></div></nav>',
      editable: true,
      droppable: true,
      properties: {
        brand: 'Brand',
        class: 'navbar navbar-expand-lg navbar-light bg-light'
      },
      styles: {
        padding: '16px 0'
      }
    },

    breadcrumb: {
      name: 'Breadcrumb',
      category: 'navigation',
      icon: 'fa-map-signs',
      html: '<nav aria-label="breadcrumb"><ol class="breadcrumb"><li class="breadcrumb-item"><a href="#">Home</a></li><li class="breadcrumb-item active" aria-current="page">Current</li></ol></nav>',
      editable: true,
      droppable: false,
      properties: {
        class: 'breadcrumb'
      },
      styles: {
        marginBottom: '16px'
      }
    },

    pagination: {
      name: 'Pagination',
      category: 'navigation',
      icon: 'fa-ellipsis-h',
      html: '<nav><ul class="pagination"><li class="page-item"><a class="page-link" href="#">Previous</a></li><li class="page-item"><a class="page-link" href="#">1</a></li><li class="page-item"><a class="page-link" href="#">2</a></li><li class="page-item"><a class="page-link" href="#">Next</a></li></ul></nav>',
      editable: true,
      droppable: false,
      properties: {
        class: 'pagination'
      },
      styles: {
        marginTop: '20px'
      }
    },

    tabs: {
      name: 'Tabs',
      category: 'navigation',
      icon: 'fa-folder',
      html: '<ul class="nav nav-tabs"><li class="nav-item"><a class="nav-link active" href="#">Tab 1</a></li><li class="nav-item"><a class="nav-link" href="#">Tab 2</a></li><li class="nav-item"><a class="nav-link" href="#">Tab 3</a></li></ul>',
      editable: true,
      droppable: false,
      properties: {
        class: 'nav nav-tabs'
      },
      styles: {
        marginBottom: '20px'
      }
    },

    // ========== Data Components ==========
    table: {
      name: 'Table',
      category: 'data',
      icon: 'fa-table',
      html: '<table class="table"><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td>Data 1</td><td>Data 2</td><td>Data 3</td></tr><tr><td>Data 4</td><td>Data 5</td><td>Data 6</td></tr></tbody></table>',
      editable: true,
      droppable: true,
      properties: {
        class: 'table'
      },
      styles: {
        width: '100%',
        marginBottom: '20px'
      }
    },

    chart: {
      name: 'Chart',
      category: 'data',
      icon: 'fa-chart-bar',
      html: '<div class="chart-placeholder"><i class="fas fa-chart-bar"></i><p>Chart placeholder - Add Chart.js integration</p></div>',
      editable: true,
      droppable: false,
      properties: {
        type: 'bar',
        class: 'chart-placeholder'
      },
      styles: {
        padding: '40px',
        background: '#f8f9fa',
        textAlign: 'center',
        borderRadius: '8px',
        marginBottom: '20px'
      }
    },

    'code-block': {
      name: 'Code Block',
      category: 'data',
      icon: 'fa-code',
      html: '<pre><code>// Code goes here\nconsole.log("Hello World");</code></pre>',
      editable: true,
      droppable: false,
      properties: {
        code: '// Code goes here\nconsole.log("Hello World");',
        language: 'javascript',
        class: ''
      },
      styles: {
        padding: '16px',
        background: '#f8f9fa',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'monospace',
        marginBottom: '16px'
      }
    }
  },

  /**
   * Generate a component instance
   * @param {string} type - Component type
   * @param {object} properties - Component properties
   * @returns {HTMLElement} - Component element
   */
  generate(type, properties = {}) {
    const component = this.components[type];
    if (!component) {
      console.error('Component type not found:', type);
      return null;
    }

    // Create element from HTML template
    const temp = document.createElement('div');
    temp.innerHTML = component.html.trim();
    const element = temp.firstChild;

    // Generate unique ID
    const id = 'elem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    element.setAttribute('data-element-id', id);
    element.setAttribute('data-component-type', type);

    // Add canvas element class
    element.classList.add('canvas-element');

    // Apply default properties
    const props = { ...component.properties, ...properties };
    this.applyProperties(element, type, props);

    // Apply default styles
    const styles = { ...component.styles, ...(properties.styles || {}) };
    this.applyStyles(element, styles);

    // Make editable if configured
    if (component.editable) {
      element.setAttribute('contenteditable', 'false');
    }

    // Add element controls
    this.addElementControls(element);

    return element;
  },

  /**
   * Apply properties to element
   * @param {HTMLElement} element - Target element
   * @param {string} type - Component type
   * @param {object} properties - Properties to apply
   */
  applyProperties(element, type, properties) {
    const component = this.components[type];

    // Handle text content
    if (properties.text !== undefined) {
      if (element.tagName === 'A' || element.tagName === 'BUTTON' || element.tagName === 'SPAN') {
        element.textContent = properties.text;
      } else if (element.tagName === 'P' || element.tagName.startsWith('H')) {
        element.textContent = properties.text;
      }
    }

    // Handle link properties
    if (properties.href !== undefined) {
      element.setAttribute('href', properties.href);
    }
    if (properties.target !== undefined) {
      element.setAttribute('target', properties.target);
    }

    // Handle image properties
    if (properties.src !== undefined) {
      element.setAttribute('src', properties.src);
    }
    if (properties.alt !== undefined) {
      element.setAttribute('alt', properties.alt);
    }

    // Handle form properties
    if (properties.name !== undefined) {
      element.setAttribute('name', properties.name);
    }
    if (properties.placeholder !== undefined) {
      element.setAttribute('placeholder', properties.placeholder);
    }
    if (properties.value !== undefined) {
      element.setAttribute('value', properties.value);
    }
    if (properties.required !== undefined) {
      if (properties.required) {
        element.setAttribute('required', '');
      } else {
        element.removeAttribute('required');
      }
    }

    // Handle class
    if (properties.class !== undefined && properties.class) {
      element.className = properties.class;
      element.classList.add('canvas-element');
    }

    // Store properties as data attribute
    element.setAttribute('data-properties', JSON.stringify(properties));
  },

  /**
   * Apply styles to element
   * @param {HTMLElement} element - Target element
   * @param {object} styles - Styles to apply
   */
  applyStyles(element, styles) {
    Object.keys(styles).forEach(property => {
      element.style[property] = styles[property];
    });

    // Store styles as data attribute
    element.setAttribute('data-styles', JSON.stringify(styles));
  },

  /**
   * Add element controls overlay
   * @param {HTMLElement} element - Target element
   */
  addElementControls(element) {
    const controls = document.createElement('div');
    controls.className = 'element-controls';
    controls.innerHTML = `
      <button class="duplicate-btn" title="Duplicate"><i class="fas fa-copy"></i></button>
      <button class="delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
    `;

    // Prevent controls from being part of export
    controls.setAttribute('data-no-export', 'true');

    element.appendChild(controls);

    // Add event listeners
    controls.querySelector('.duplicate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.duplicateElement(element);
    });

    controls.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteElement(element);
    });
  },

  /**
   * Duplicate an element
   * @param {HTMLElement} element - Element to duplicate
   */
  duplicateElement(element) {
    const type = element.getAttribute('data-component-type');
    const properties = JSON.parse(element.getAttribute('data-properties') || '{}');
    const styles = JSON.parse(element.getAttribute('data-styles') || '{}');

    const duplicate = this.generate(type, { ...properties, styles });

    // Insert after original
    element.parentNode.insertBefore(duplicate, element.nextSibling);

    // Trigger event
    const event = new CustomEvent('element-duplicated', {
      detail: { original: element, duplicate }
    });
    document.dispatchEvent(event);
  },

  /**
   * Delete an element
   * @param {HTMLElement} element - Element to delete
   */
  deleteElement(element) {
    if (confirm('Delete this element?')) {
      // Trigger event before deletion
      const event = new CustomEvent('element-deleted', {
        detail: { element }
      });
      document.dispatchEvent(event);

      element.remove();
    }
  },

  /**
   * Serialize element to JSON
   * @param {HTMLElement} element - Element to serialize
   * @returns {object} - Serialized element
   */
  serialize(element) {
    const type = element.getAttribute('data-component-type');
    const id = element.getAttribute('data-element-id');
    const properties = JSON.parse(element.getAttribute('data-properties') || '{}');
    const styles = JSON.parse(element.getAttribute('data-styles') || '{}');

    // Get children
    const children = [];
    Array.from(element.children).forEach(child => {
      if (child.classList.contains('canvas-element')) {
        children.push(this.serialize(child));
      }
    });

    return {
      type,
      id,
      properties,
      styles,
      children
    };
  },

  /**
   * Deserialize JSON to element
   * @param {object} data - Serialized element data
   * @returns {HTMLElement} - Deserialized element
   */
  deserialize(data) {
    const element = this.generate(data.type, {
      ...data.properties,
      styles: data.styles
    });

    // Set ID
    element.setAttribute('data-element-id', data.id);

    // Add children
    if (data.children && data.children.length > 0) {
      data.children.forEach(childData => {
        const child = this.deserialize(childData);
        // Remove controls before appending
        const controls = element.querySelector('.element-controls');
        if (controls) {
          element.insertBefore(child, controls);
        } else {
          element.appendChild(child);
        }
      });
    }

    return element;
  },

  /**
   * Export element to HTML string
   * @param {HTMLElement} element - Element to export
   * @param {boolean} includeStyles - Include inline styles
   * @returns {string} - HTML string
   */
  exportHTML(element, includeStyles = true) {
    const clone = element.cloneNode(true);

    // Remove element controls and canvas classes
    clone.querySelectorAll('[data-no-export]').forEach(el => el.remove());
    clone.classList.remove('canvas-element', 'selected');
    clone.removeAttribute('data-element-id');
    clone.removeAttribute('data-component-type');
    clone.removeAttribute('data-properties');
    clone.removeAttribute('data-styles');

    // Process children
    clone.querySelectorAll('.canvas-element').forEach(child => {
      child.classList.remove('canvas-element', 'selected');
      child.querySelectorAll('[data-no-export]').forEach(el => el.remove());
    });

    if (!includeStyles) {
      // Remove inline styles
      clone.removeAttribute('style');
      clone.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
    }

    return clone.outerHTML;
  },

  /**
   * Get component definition
   * @param {string} type - Component type
   * @returns {object} - Component definition
   */
  getComponent(type) {
    return this.components[type] || null;
  },

  /**
   * Get all components by category
   * @param {string} category - Category name
   * @returns {array} - Array of components
   */
  getComponentsByCategory(category) {
    return Object.entries(this.components)
      .filter(([key, comp]) => comp.category === category)
      .map(([key, comp]) => ({ type: key, ...comp }));
  },

  /**
   * Check if component can be dropped on target
   * @param {string} componentType - Component type
   * @param {HTMLElement} target - Target element
   * @returns {boolean} - Can drop
   */
  canDrop(componentType, target) {
    const component = this.components[componentType];
    if (!component) return false;

    // Check if target accepts drops
    const targetType = target.getAttribute('data-component-type');
    if (!targetType) return true; // Canvas root

    const targetComponent = this.components[targetType];
    return targetComponent && targetComponent.droppable;
  }
};

// Make globally accessible
window.ComponentLibrary = ComponentLibrary;

console.log('[Component Library] Loaded', Object.keys(ComponentLibrary.components).length, 'components');
