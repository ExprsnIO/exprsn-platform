/**
 * ═══════════════════════════════════════════════════════════
 * WYSIWYG Component Library
 * Comprehensive HTML5, Bootstrap, jQuery UI component definitions
 * ═══════════════════════════════════════════════════════════
 */

const WYSIWYGComponents = {
  /**
   * HTML5 Basic Elements
   */
  html5: {
    category: 'HTML5',
    icon: 'fa-code',
    components: [
      {
        name: 'Div Container',
        icon: 'fa-box',
        type: 'div',
        template: '<div class="container-fluid p-3">Container content here</div>',
        properties: {
          className: 'container-fluid p-3',
          innerHTML: 'Container content here'
        }
      },
      {
        name: 'Paragraph',
        icon: 'fa-paragraph',
        type: 'p',
        template: '<p>This is a paragraph of text.</p>',
        properties: {
          innerHTML: 'This is a paragraph of text.'
        }
      },
      {
        name: 'Heading H1',
        icon: 'fa-heading',
        type: 'h1',
        template: '<h1>Heading 1</h1>',
        properties: {
          innerHTML: 'Heading 1'
        }
      },
      {
        name: 'Heading H2',
        icon: 'fa-heading',
        type: 'h2',
        template: '<h2>Heading 2</h2>',
        properties: {
          innerHTML: 'Heading 2'
        }
      },
      {
        name: 'Heading H3',
        icon: 'fa-heading',
        type: 'h3',
        template: '<h3>Heading 3</h3>',
        properties: {
          innerHTML: 'Heading 3'
        }
      },
      {
        name: 'Link',
        icon: 'fa-link',
        type: 'a',
        template: '<a href="#" class="text-decoration-none">Link Text</a>',
        properties: {
          href: '#',
          innerHTML: 'Link Text',
          target: '_self'
        }
      },
      {
        name: 'Image',
        icon: 'fa-image',
        type: 'img',
        template: '<img src="https://via.placeholder.com/400x300" alt="Placeholder" class="img-fluid">',
        properties: {
          src: 'https://via.placeholder.com/400x300',
          alt: 'Placeholder',
          className: 'img-fluid'
        }
      },
      {
        name: 'Span',
        icon: 'fa-font',
        type: 'span',
        template: '<span>Inline text</span>',
        properties: {
          innerHTML: 'Inline text'
        }
      },
      {
        name: 'Unordered List',
        icon: 'fa-list-ul',
        type: 'ul',
        template: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>',
        properties: {
          items: ['Item 1', 'Item 2', 'Item 3']
        }
      },
      {
        name: 'Ordered List',
        icon: 'fa-list-ol',
        type: 'ol',
        template: '<ol><li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>',
        properties: {
          items: ['Item 1', 'Item 2', 'Item 3']
        }
      },
      {
        name: 'Table',
        icon: 'fa-table',
        type: 'table',
        template: `<table class="table table-striped">
          <thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>
          <tbody><tr><td>Data 1</td><td>Data 2</td></tr></tbody>
        </table>`,
        properties: {
          className: 'table table-striped',
          headers: ['Header 1', 'Header 2'],
          rows: [['Data 1', 'Data 2']]
        }
      },
      {
        name: 'Video',
        icon: 'fa-video',
        type: 'video',
        template: '<video controls class="w-100"><source src="" type="video/mp4">Your browser does not support video.</video>',
        properties: {
          src: '',
          controls: true,
          autoplay: false,
          loop: false
        }
      },
      {
        name: 'Audio',
        icon: 'fa-music',
        type: 'audio',
        template: '<audio controls><source src="" type="audio/mpeg">Your browser does not support audio.</audio>',
        properties: {
          src: '',
          controls: true,
          autoplay: false,
          loop: false
        }
      },
      {
        name: 'IFrame',
        icon: 'fa-window-maximize',
        type: 'iframe',
        template: '<iframe src="about:blank" class="w-100" style="height: 400px; border: 1px solid #ddd;"></iframe>',
        properties: {
          src: 'about:blank',
          className: 'w-100',
          height: '400px'
        }
      },
      {
        name: 'Section',
        icon: 'fa-layer-group',
        type: 'section',
        template: '<section class="py-5"><div class="container"><h2>Section Title</h2><p>Section content</p></div></section>',
        properties: {
          className: 'py-5'
        }
      },
      {
        name: 'Article',
        icon: 'fa-file-alt',
        type: 'article',
        template: '<article><h3>Article Title</h3><p>Article content goes here...</p></article>',
        properties: {}
      },
      {
        name: 'Header',
        icon: 'fa-heading',
        type: 'header',
        template: '<header class="bg-light p-4"><h1>Site Header</h1></header>',
        properties: {
          className: 'bg-light p-4'
        }
      },
      {
        name: 'Footer',
        icon: 'fa-shoe-prints',
        type: 'footer',
        template: '<footer class="bg-dark text-white p-4 text-center"><p>&copy; 2025 Your Company</p></footer>',
        properties: {
          className: 'bg-dark text-white p-4 text-center'
        }
      },
      {
        name: 'Nav',
        icon: 'fa-bars',
        type: 'nav',
        template: '<nav class="navbar navbar-expand-lg navbar-light bg-light"><div class="container-fluid"><a class="navbar-brand" href="#">Brand</a></div></nav>',
        properties: {
          className: 'navbar navbar-expand-lg navbar-light bg-light'
        }
      },
      {
        name: 'HR',
        icon: 'fa-minus',
        type: 'hr',
        template: '<hr>',
        properties: {}
      },
      {
        name: 'Blockquote',
        icon: 'fa-quote-right',
        type: 'blockquote',
        template: '<blockquote class="blockquote"><p>A well-known quote, contained in a blockquote element.</p></blockquote>',
        properties: {
          innerHTML: 'A well-known quote, contained in a blockquote element.'
        }
      },
      {
        name: 'Code Block',
        icon: 'fa-code',
        type: 'pre',
        template: '<pre><code>// Your code here\nfunction example() {\n  return true;\n}</code></pre>',
        properties: {
          language: 'javascript'
        }
      }
    ]
  },

  /**
   * Form Elements
   */
  forms: {
    category: 'Forms',
    icon: 'fa-wpforms',
    components: [
      {
        name: 'Form',
        icon: 'fa-file-alt',
        type: 'form',
        template: '<form><div class="mb-3"><label class="form-label">Email</label><input type="email" class="form-control"></div></form>',
        properties: {
          method: 'POST',
          action: ''
        }
      },
      {
        name: 'Input Text',
        icon: 'fa-i-cursor',
        type: 'input-text',
        template: '<div class="mb-3"><label class="form-label">Label</label><input type="text" class="form-control" placeholder="Enter text"></div>',
        properties: {
          type: 'text',
          placeholder: 'Enter text',
          required: false
        }
      },
      {
        name: 'Input Email',
        icon: 'fa-envelope',
        type: 'input-email',
        template: '<div class="mb-3"><label class="form-label">Email</label><input type="email" class="form-control" placeholder="name@example.com"></div>',
        properties: {
          type: 'email',
          placeholder: 'name@example.com',
          required: false
        }
      },
      {
        name: 'Input Password',
        icon: 'fa-key',
        type: 'input-password',
        template: '<div class="mb-3"><label class="form-label">Password</label><input type="password" class="form-control"></div>',
        properties: {
          type: 'password',
          required: false
        }
      },
      {
        name: 'Textarea',
        icon: 'fa-align-left',
        type: 'textarea',
        template: '<div class="mb-3"><label class="form-label">Message</label><textarea class="form-control" rows="3"></textarea></div>',
        properties: {
          rows: 3,
          required: false
        }
      },
      {
        name: 'Select',
        icon: 'fa-caret-square-down',
        type: 'select',
        template: '<div class="mb-3"><label class="form-label">Select</label><select class="form-select"><option>Option 1</option><option>Option 2</option></select></div>',
        properties: {
          options: ['Option 1', 'Option 2'],
          required: false
        }
      },
      {
        name: 'Checkbox',
        icon: 'fa-check-square',
        type: 'checkbox',
        template: '<div class="form-check"><input class="form-check-input" type="checkbox" id="check1"><label class="form-check-label" for="check1">Check me</label></div>',
        properties: {
          label: 'Check me',
          checked: false
        }
      },
      {
        name: 'Radio',
        icon: 'fa-dot-circle',
        type: 'radio',
        template: '<div class="form-check"><input class="form-check-input" type="radio" name="radio" id="radio1"><label class="form-check-label" for="radio1">Option 1</label></div>',
        properties: {
          label: 'Option 1',
          name: 'radio',
          checked: false
        }
      },
      {
        name: 'File Upload',
        icon: 'fa-upload',
        type: 'input-file',
        template: '<div class="mb-3"><label class="form-label">Upload File</label><input class="form-control" type="file"></div>',
        properties: {
          accept: '*',
          multiple: false
        }
      },
      {
        name: 'Date Picker',
        icon: 'fa-calendar',
        type: 'input-date',
        template: '<div class="mb-3"><label class="form-label">Date</label><input type="date" class="form-control"></div>',
        properties: {
          type: 'date'
        }
      },
      {
        name: 'Range Slider',
        icon: 'fa-sliders-h',
        type: 'input-range',
        template: '<div class="mb-3"><label class="form-label">Range</label><input type="range" class="form-range" min="0" max="100"></div>',
        properties: {
          min: 0,
          max: 100,
          step: 1
        }
      },
      {
        name: 'Color Picker',
        icon: 'fa-palette',
        type: 'input-color',
        template: '<div class="mb-3"><label class="form-label">Color</label><input type="color" class="form-control form-control-color" value="#667eea"></div>',
        properties: {
          value: '#667eea'
        }
      }
    ]
  },

  /**
   * Bootstrap Components
   */
  bootstrap: {
    category: 'Bootstrap',
    icon: 'fab fa-bootstrap',
    components: [
      {
        name: 'Button Primary',
        icon: 'fa-hand-pointer',
        type: 'btn-primary',
        template: '<button type="button" class="btn btn-primary">Primary Button</button>',
        properties: {
          text: 'Primary Button',
          variant: 'primary',
          size: ''
        }
      },
      {
        name: 'Button Secondary',
        icon: 'fa-hand-pointer',
        type: 'btn-secondary',
        template: '<button type="button" class="btn btn-secondary">Secondary Button</button>',
        properties: {
          text: 'Secondary Button',
          variant: 'secondary'
        }
      },
      {
        name: 'Alert',
        icon: 'fa-exclamation-triangle',
        type: 'alert',
        template: '<div class="alert alert-primary" role="alert">This is a primary alert</div>',
        properties: {
          text: 'This is a primary alert',
          variant: 'primary',
          dismissible: false
        }
      },
      {
        name: 'Badge',
        icon: 'fa-certificate',
        type: 'badge',
        template: '<span class="badge bg-primary">Badge</span>',
        properties: {
          text: 'Badge',
          variant: 'primary'
        }
      },
      {
        name: 'Card',
        icon: 'fa-id-card',
        type: 'card',
        template: `<div class="card" style="width: 18rem;">
          <div class="card-body">
            <h5 class="card-title">Card Title</h5>
            <p class="card-text">Card content goes here.</p>
            <a href="#" class="btn btn-primary">Action</a>
          </div>
        </div>`,
        properties: {
          title: 'Card Title',
          text: 'Card content goes here.',
          hasImage: false
        }
      },
      {
        name: 'Accordion',
        icon: 'fa-th-list',
        type: 'accordion',
        template: `<div class="accordion" id="accordion1">
          <div class="accordion-item">
            <h2 class="accordion-header">
              <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapse1">
                Accordion Item #1
              </button>
            </h2>
            <div id="collapse1" class="accordion-collapse collapse show" data-bs-parent="#accordion1">
              <div class="accordion-body">Content for accordion item.</div>
            </div>
          </div>
        </div>`,
        properties: {
          items: [{ title: 'Accordion Item #1', content: 'Content for accordion item.' }]
        }
      },
      {
        name: 'Breadcrumb',
        icon: 'fa-ellipsis-h',
        type: 'breadcrumb',
        template: `<nav aria-label="breadcrumb">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="#">Home</a></li>
            <li class="breadcrumb-item active" aria-current="page">Current</li>
          </ol>
        </nav>`,
        properties: {
          items: ['Home', 'Current']
        }
      },
      {
        name: 'Dropdown',
        icon: 'fa-caret-down',
        type: 'dropdown',
        template: `<div class="dropdown">
          <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
            Dropdown
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#">Action</a></li>
            <li><a class="dropdown-item" href="#">Another action</a></li>
          </ul>
        </div>`,
        properties: {
          buttonText: 'Dropdown',
          items: ['Action', 'Another action']
        }
      },
      {
        name: 'Modal',
        icon: 'fa-window-maximize',
        type: 'modal',
        template: `<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modal1">Launch Modal</button>
        <div class="modal fade" id="modal1" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Modal Title</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">Modal content goes here.</div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary">Save</button>
              </div>
            </div>
          </div>
        </div>`,
        properties: {
          title: 'Modal Title',
          content: 'Modal content goes here.'
        }
      },
      {
        name: 'Progress Bar',
        icon: 'fa-tasks',
        type: 'progress',
        template: '<div class="progress"><div class="progress-bar" role="progressbar" style="width: 50%" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100">50%</div></div>',
        properties: {
          value: 50,
          variant: 'primary',
          striped: false,
          animated: false
        }
      },
      {
        name: 'Spinner',
        icon: 'fa-spinner',
        type: 'spinner',
        template: '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>',
        properties: {
          variant: 'primary',
          type: 'border'
        }
      },
      {
        name: 'Toast',
        icon: 'fa-bell',
        type: 'toast',
        template: `<div class="toast" role="alert">
          <div class="toast-header">
            <strong class="me-auto">Toast Title</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
          </div>
          <div class="toast-body">Toast message content.</div>
        </div>`,
        properties: {
          title: 'Toast Title',
          content: 'Toast message content.'
        }
      },
      {
        name: 'Pagination',
        icon: 'fa-step-forward',
        type: 'pagination',
        template: `<nav>
          <ul class="pagination">
            <li class="page-item"><a class="page-link" href="#">Previous</a></li>
            <li class="page-item active"><a class="page-link" href="#">1</a></li>
            <li class="page-item"><a class="page-link" href="#">2</a></li>
            <li class="page-item"><a class="page-link" href="#">Next</a></li>
          </ul>
        </nav>`,
        properties: {
          pages: 2,
          currentPage: 1
        }
      },
      {
        name: 'List Group',
        icon: 'fa-list',
        type: 'list-group',
        template: `<ul class="list-group">
          <li class="list-group-item">Item 1</li>
          <li class="list-group-item">Item 2</li>
          <li class="list-group-item">Item 3</li>
        </ul>`,
        properties: {
          items: ['Item 1', 'Item 2', 'Item 3']
        }
      }
    ]
  },

  /**
   * jQuery UI Widgets
   */
  jqueryui: {
    category: 'jQuery UI',
    icon: 'fab fa-js',
    components: [
      {
        name: 'Datepicker',
        icon: 'fa-calendar-alt',
        type: 'ui-datepicker',
        template: '<input type="text" class="form-control datepicker" placeholder="Select date">',
        properties: {
          dateFormat: 'mm/dd/yy',
          showButtonPanel: true
        },
        initScript: '$(".datepicker").datepicker();'
      },
      {
        name: 'Autocomplete',
        icon: 'fa-search',
        type: 'ui-autocomplete',
        template: '<input type="text" class="form-control autocomplete" placeholder="Search...">',
        properties: {
          source: []
        },
        initScript: '$(".autocomplete").autocomplete({ source: ["Option 1", "Option 2", "Option 3"] });'
      },
      {
        name: 'Slider',
        icon: 'fa-sliders-h',
        type: 'ui-slider',
        template: '<div class="ui-slider-container"><div class="ui-slider"></div></div>',
        properties: {
          min: 0,
          max: 100,
          value: 50
        },
        initScript: '$(".ui-slider").slider({ min: 0, max: 100, value: 50 });'
      },
      {
        name: 'Tabs',
        icon: 'fa-folder',
        type: 'ui-tabs',
        template: `<div class="ui-tabs">
          <ul>
            <li><a href="#tabs-1">Tab 1</a></li>
            <li><a href="#tabs-2">Tab 2</a></li>
          </ul>
          <div id="tabs-1"><p>Content for Tab 1</p></div>
          <div id="tabs-2"><p>Content for Tab 2</p></div>
        </div>`,
        properties: {
          tabs: ['Tab 1', 'Tab 2']
        },
        initScript: '$(".ui-tabs").tabs();'
      },
      {
        name: 'Dialog',
        icon: 'fa-comment',
        type: 'ui-dialog',
        template: '<div class="ui-dialog-content" title="Dialog Title"><p>Dialog content goes here.</p></div>',
        properties: {
          title: 'Dialog Title',
          modal: true,
          autoOpen: false
        },
        initScript: '$(".ui-dialog-content").dialog({ autoOpen: false, modal: true });'
      },
      {
        name: 'Progressbar',
        icon: 'fa-percentage',
        type: 'ui-progressbar',
        template: '<div class="ui-progressbar"></div>',
        properties: {
          value: 50
        },
        initScript: '$(".ui-progressbar").progressbar({ value: 50 });'
      }
    ]
  },

  /**
   * Layout Components
   */
  layout: {
    category: 'Layout',
    icon: 'fa-th',
    components: [
      {
        name: 'Container',
        icon: 'fa-box',
        type: 'container',
        template: '<div class="container"></div>',
        properties: {
          fluid: false
        }
      },
      {
        name: 'Row',
        icon: 'fa-grip-horizontal',
        type: 'row',
        template: '<div class="row"></div>',
        properties: {}
      },
      {
        name: '2 Columns',
        icon: 'fa-columns',
        type: 'col-2',
        template: '<div class="row"><div class="col-md-6">Column 1</div><div class="col-md-6">Column 2</div></div>',
        properties: {
          columns: 2
        }
      },
      {
        name: '3 Columns',
        icon: 'fa-columns',
        type: 'col-3',
        template: '<div class="row"><div class="col-md-4">Column 1</div><div class="col-md-4">Column 2</div><div class="col-md-4">Column 3</div></div>',
        properties: {
          columns: 3
        }
      },
      {
        name: '4 Columns',
        icon: 'fa-th-large',
        type: 'col-4',
        template: '<div class="row"><div class="col-md-3">Col 1</div><div class="col-md-3">Col 2</div><div class="col-md-3">Col 3</div><div class="col-md-3">Col 4</div></div>',
        properties: {
          columns: 4
        }
      },
      {
        name: 'Sidebar Layout',
        icon: 'fa-sidebar',
        type: 'sidebar-layout',
        template: `<div class="row">
          <div class="col-md-3 bg-light p-3">Sidebar</div>
          <div class="col-md-9 p-3">Main Content</div>
        </div>`,
        properties: {
          sidebarWidth: 3
        }
      }
    ]
  },

  /**
   * Data Components
   */
  data: {
    category: 'Data',
    icon: 'fa-database',
    components: [
      {
        name: 'Data Table',
        icon: 'fa-table',
        type: 'data-table',
        template: '<table class="table table-striped" data-source="" data-type=""><thead></thead><tbody></tbody></table>',
        properties: {
          dataSource: '',
          dataType: 'json',
          columns: [],
          sortable: true,
          filterable: true
        }
      },
      {
        name: 'Data List',
        icon: 'fa-list',
        type: 'data-list',
        template: '<ul class="list-group" data-source="" data-type=""></ul>',
        properties: {
          dataSource: '',
          dataType: 'json',
          template: '<li class="list-group-item">{{item}}</li>'
        }
      },
      {
        name: 'Data Grid',
        icon: 'fa-th',
        type: 'data-grid',
        template: '<div class="row data-grid" data-source="" data-type=""></div>',
        properties: {
          dataSource: '',
          dataType: 'json',
          columns: 3,
          template: '<div class="col-md-4"><div class="card"><div class="card-body">{{content}}</div></div></div>'
        }
      },
      {
        name: 'Chart',
        icon: 'fa-chart-bar',
        type: 'chart',
        template: '<canvas class="chart" data-type="bar" width="400" height="200"></canvas>',
        properties: {
          chartType: 'bar',
          dataSource: '',
          width: 400,
          height: 200
        }
      }
    ]
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WYSIWYGComponents;
}
