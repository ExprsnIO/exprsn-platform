/**
 * SVR Visual Designer - Configuration
 * Constants, settings, and global configuration
 */

const DesignerConfig = {
  // API Configuration
  api: {
    baseUrl: window.location.origin,
    endpoints: {
      pages: '/api/pages',
      upload: '/api/upload',
      assets: '/api/assets'
    }
  },

  // Canvas Configuration
  canvas: {
    defaultWidth: 1400,
    snapGrid: 20,
    minZoom: 0.25,
    maxZoom: 2,
    zoomStep: 0.25
  },

  // Device Breakpoints
  devices: {
    desktop: { width: '100%', maxWidth: 1400, icon: 'fa-desktop' },
    tablet: { width: 768, maxWidth: 768, icon: 'fa-tablet-alt' },
    mobile: { width: 375, maxWidth: 375, icon: 'fa-mobile-alt' }
  },

  // Component Categories
  componentCategories: [
    { id: 'layout', name: 'Layout', icon: 'fa-th' },
    { id: 'typography', name: 'Typography', icon: 'fa-font' },
    { id: 'forms', name: 'Forms', icon: 'fa-wpforms' },
    { id: 'ui', name: 'UI Elements', icon: 'fa-puzzle-piece' },
    { id: 'navigation', name: 'Navigation', icon: 'fa-bars' },
    { id: 'data', name: 'Data', icon: 'fa-database' }
  ],

  // Default Component Properties
  defaultProperties: {
    // Common properties
    id: '',
    className: '',
    style: {},

    // Text properties
    text: 'Text Content',
    html: '',

    // Layout properties
    width: 'auto',
    height: 'auto',
    padding: '0',
    margin: '0',

    // Typography properties
    fontSize: '16px',
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'left',

    // Link properties
    href: '#',
    target: '_self',

    // Image properties
    src: 'https://via.placeholder.com/400x300',
    alt: 'Image',

    // Form properties
    name: '',
    placeholder: '',
    value: '',
    required: false,

    // Button properties
    type: 'button',
    variant: 'primary'
  },

  // Style Properties Configuration
  styleProperties: [
    {
      group: 'Layout',
      properties: [
        { name: 'width', label: 'Width', type: 'text', unit: ['px', '%', 'auto', 'rem'] },
        { name: 'height', label: 'Height', type: 'text', unit: ['px', '%', 'auto', 'rem'] },
        { name: 'display', label: 'Display', type: 'select', options: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none'] },
        { name: 'position', label: 'Position', type: 'select', options: ['static', 'relative', 'absolute', 'fixed', 'sticky'] }
      ]
    },
    {
      group: 'Spacing',
      properties: [
        { name: 'margin', label: 'Margin', type: 'spacing' },
        { name: 'padding', label: 'Padding', type: 'spacing' }
      ]
    },
    {
      group: 'Typography',
      properties: [
        { name: 'fontSize', label: 'Font Size', type: 'text', unit: ['px', 'rem', 'em'] },
        { name: 'fontWeight', label: 'Font Weight', type: 'select', options: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'] },
        { name: 'fontFamily', label: 'Font Family', type: 'text' },
        { name: 'lineHeight', label: 'Line Height', type: 'text' },
        { name: 'textAlign', label: 'Text Align', type: 'select', options: ['left', 'center', 'right', 'justify'] },
        { name: 'textDecoration', label: 'Text Decoration', type: 'select', options: ['none', 'underline', 'overline', 'line-through'] },
        { name: 'textTransform', label: 'Text Transform', type: 'select', options: ['none', 'uppercase', 'lowercase', 'capitalize'] }
      ]
    },
    {
      group: 'Background',
      properties: [
        { name: 'backgroundColor', label: 'Background Color', type: 'color' },
        { name: 'backgroundImage', label: 'Background Image', type: 'text' },
        { name: 'backgroundSize', label: 'Background Size', type: 'select', options: ['auto', 'cover', 'contain'] },
        { name: 'backgroundPosition', label: 'Background Position', type: 'text' },
        { name: 'backgroundRepeat', label: 'Background Repeat', type: 'select', options: ['repeat', 'no-repeat', 'repeat-x', 'repeat-y'] }
      ]
    },
    {
      group: 'Border',
      properties: [
        { name: 'border', label: 'Border', type: 'text' },
        { name: 'borderRadius', label: 'Border Radius', type: 'text', unit: ['px', 'rem', '%'] },
        { name: 'borderColor', label: 'Border Color', type: 'color' },
        { name: 'borderWidth', label: 'Border Width', type: 'text', unit: ['px'] },
        { name: 'borderStyle', label: 'Border Style', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] }
      ]
    },
    {
      group: 'Effects',
      properties: [
        { name: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.1 },
        { name: 'boxShadow', label: 'Box Shadow', type: 'text' },
        { name: 'transform', label: 'Transform', type: 'text' },
        { name: 'transition', label: 'Transition', type: 'text' }
      ]
    },
    {
      group: 'Flexbox',
      properties: [
        { name: 'flexDirection', label: 'Flex Direction', type: 'select', options: ['row', 'row-reverse', 'column', 'column-reverse'] },
        { name: 'justifyContent', label: 'Justify Content', type: 'select', options: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'] },
        { name: 'alignItems', label: 'Align Items', type: 'select', options: ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'] },
        { name: 'flexWrap', label: 'Flex Wrap', type: 'select', options: ['nowrap', 'wrap', 'wrap-reverse'] },
        { name: 'gap', label: 'Gap', type: 'text', unit: ['px', 'rem'] }
      ]
    }
  ],

  // Undo/Redo Configuration
  history: {
    maxSteps: 50
  },

  // Auto-save Configuration
  autoSave: {
    enabled: false,
    interval: 300000 // 5 minutes
  },

  // Grid Configuration
  grid: {
    enabled: true,
    size: 20,
    color: 'rgba(0, 0, 0, 0.05)'
  },

  // Guides Configuration
  guides: {
    enabled: true,
    color: '#0d6efd',
    snapDistance: 5
  },

  // Keyboard Shortcuts
  shortcuts: {
    save: 'Ctrl+S',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    copy: 'Ctrl+C',
    paste: 'Ctrl+V',
    delete: 'Delete',
    duplicate: 'Ctrl+D',
    selectAll: 'Ctrl+A'
  },

  // Storage Keys
  storage: {
    token: 'svr-designer-token',
    settings: 'svr-designer-settings',
    recentPages: 'svr-designer-recent'
  },

  // Feature Flags
  features: {
    realTimeCollaboration: false,
    aiAssistant: false,
    advancedAnimations: true,
    customComponents: true,
    componentLibrary: true
  }
};

// Make configuration globally accessible
window.DesignerConfig = DesignerConfig;

// Helper functions
DesignerConfig.getToken = function() {
  return localStorage.getItem(this.storage.token);
};

DesignerConfig.setToken = function(token) {
  localStorage.setItem(this.storage.token, token);
};

DesignerConfig.getSettings = function() {
  const settings = localStorage.getItem(this.storage.settings);
  return settings ? JSON.parse(settings) : {};
};

DesignerConfig.saveSettings = function(settings) {
  localStorage.setItem(this.storage.settings, JSON.stringify(settings));
};

// Log configuration on load
console.log('[Designer Config] Configuration loaded');
