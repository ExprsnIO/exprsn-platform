/**
 * SVR Visual Designer - Code Editor
 * Monaco editor integration for HTML, CSS, JavaScript, and Server Code
 */

class CodeEditor {
  constructor() {
    this.editors = {};
    this.currentEditor = 'html';
    this.initialized = false;

    this.init();
  }

  /**
   * Initialize code editor
   */
  async init() {
    console.log('[Code Editor] Initializing Monaco...');

    // Initialize Monaco
    await this.initMonaco();

    // Setup tab switching
    this.setupTabs();

    console.log('[Code Editor] Initialized');
  }

  /**
   * Initialize Monaco editors
   * @returns {Promise} - Initialization promise
   */
  initMonaco() {
    return new Promise((resolve, reject) => {
      require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }
      });

      require(['vs/editor/editor.main'], () => {
        try {
          // HTML Editor
          this.editors.html = monaco.editor.create(document.getElementById('htmlEditor'), {
            value: this.getDefaultHTML(),
            language: 'html',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true
          });

          // CSS Editor
          this.editors.css = monaco.editor.create(document.getElementById('cssEditor'), {
            value: this.getDefaultCSS(),
            language: 'css',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            formatOnPaste: true,
            formatOnType: true
          });

          // JavaScript Editor
          this.editors.javascript = monaco.editor.create(document.getElementById('jsEditor'), {
            value: this.getDefaultJS(),
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            formatOnPaste: true,
            formatOnType: true
          });

          // Server Code Editor
          this.editors.server = monaco.editor.create(document.getElementById('serverEditor'), {
            value: this.getDefaultServerCode(),
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            formatOnPaste: true,
            formatOnType: true
          });

          this.initialized = true;
          console.log('[Code Editor] Monaco editors created');
          resolve();
        } catch (error) {
          console.error('[Code Editor] Failed to create editors:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Setup tab switching
   */
  setupTabs() {
    document.querySelectorAll('.code-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const editor = e.target.getAttribute('data-editor');
        this.switchEditor(editor);
      });
    });
  }

  /**
   * Switch active editor
   * @param {string} editorName - Editor name
   */
  switchEditor(editorName) {
    if (!this.editors[editorName]) {
      console.error('[Code Editor] Editor not found:', editorName);
      return;
    }

    this.currentEditor = editorName;

    // Hide all editors
    Object.keys(this.editors).forEach(name => {
      const container = document.getElementById(name + 'Editor');
      if (container) {
        container.style.display = 'none';
      }
    });

    // Show selected editor
    const container = document.getElementById(editorName + 'Editor');
    if (container) {
      container.style.display = 'block';
    }

    // Update tabs
    document.querySelectorAll('.code-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-editor') === editorName) {
        tab.classList.add('active');
      }
    });

    // Refresh layout
    if (this.editors[editorName]) {
      this.editors[editorName].layout();
    }

    console.log('[Code Editor] Switched to:', editorName);
  }

  /**
   * Get default HTML template
   * @returns {string} - HTML template
   */
  getDefaultHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title</title>
</head>
<body>
    <div class="container">
        <h1>Hello, World!</h1>
        <p>Edit this page using the visual designer or code editor.</p>
    </div>
</body>
</html>`;
  }

  /**
   * Get default CSS
   * @returns {string} - CSS template
   */
  getDefaultCSS() {
    return `/* Custom styles */
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}`;
  }

  /**
   * Get default JavaScript
   * @returns {string} - JavaScript template
   */
  getDefaultJS() {
    return `// Client-side JavaScript
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded');

    // Access server data
    if (typeof serverData !== 'undefined') {
        console.log('Server data:', serverData);
    }

    // Socket.IO integration
    if (typeof socket !== 'undefined') {
        socket.on('connect', () => {
            console.log('Connected to server');
        });

        window.addEventListener('socket:data:updated', (event) => {
            console.log('Data updated:', event.detail);
        });
    }
});`;
  }

  /**
   * Get default server code
   * @returns {string} - Server code template
   */
  getDefaultServerCode() {
    return `// Server-side JavaScript (Node.js)
// This code runs on the server when the page is requested
// Return an object that will be available as 'serverData' in the client

return {
    message: 'Hello from server!',
    timestamp: Date.now(),
    pageTitle: page.title,
    // Add your server-side data here
};`;
  }

  /**
   * Sync content from canvas
   * @param {DesignerCanvas} canvas - Canvas instance
   */
  syncFromCanvas(canvas) {
    if (!this.initialized) {
      console.warn('[Code Editor] Editors not initialized yet');
      return;
    }

    // Get HTML from canvas
    const html = canvas.getHTML(false); // Without inline styles

    // Update HTML editor
    if (this.editors.html) {
      const currentValue = this.editors.html.getValue();
      // Only update if different to preserve cursor position
      if (currentValue !== html) {
        this.editors.html.setValue(html);
      }
    }

    console.log('[Code Editor] Synced from canvas');
  }

  /**
   * Sync content to canvas
   * @param {DesignerCanvas} canvas - Canvas instance
   */
  syncToCanvas(canvas) {
    if (!this.initialized) {
      console.warn('[Code Editor] Editors not initialized yet');
      return;
    }

    // Get HTML from editor
    const html = this.getHTML();

    // Parse and validate
    try {
      // Set canvas HTML
      canvas.setHTML(html);

      console.log('[Code Editor] Synced to canvas');
    } catch (error) {
      console.error('[Code Editor] Failed to sync to canvas:', error);
      alert('Invalid HTML. Please check your code and try again.');
    }
  }

  /**
   * Get HTML content
   * @returns {string} - HTML content
   */
  getHTML() {
    return this.editors.html ? this.editors.html.getValue() : '';
  }

  /**
   * Get CSS content
   * @returns {string} - CSS content
   */
  getCSS() {
    return this.editors.css ? this.editors.css.getValue() : '';
  }

  /**
   * Get JavaScript content
   * @returns {string} - JavaScript content
   */
  getJavaScript() {
    return this.editors.javascript ? this.editors.javascript.getValue() : '';
  }

  /**
   * Get Server Code content
   * @returns {string} - Server code content
   */
  getServerCode() {
    return this.editors.server ? this.editors.server.getValue() : '';
  }

  /**
   * Set HTML content
   * @param {string} html - HTML content
   */
  setHTML(html) {
    if (this.editors.html) {
      this.editors.html.setValue(html || this.getDefaultHTML());
    }
  }

  /**
   * Set CSS content
   * @param {string} css - CSS content
   */
  setCSS(css) {
    if (this.editors.css) {
      this.editors.css.setValue(css || this.getDefaultCSS());
    }
  }

  /**
   * Set JavaScript content
   * @param {string} js - JavaScript content
   */
  setJavaScript(js) {
    if (this.editors.javascript) {
      this.editors.javascript.setValue(js || this.getDefaultJS());
    }
  }

  /**
   * Set Server Code content
   * @param {string} code - Server code content
   */
  setServerCode(code) {
    if (this.editors.server) {
      this.editors.server.setValue(code || this.getDefaultServerCode());
    }
  }

  /**
   * Format current editor
   */
  format() {
    const editor = this.editors[this.currentEditor];
    if (editor) {
      editor.getAction('editor.action.formatDocument').run();
    }
  }

  /**
   * Find in current editor
   */
  find() {
    const editor = this.editors[this.currentEditor];
    if (editor) {
      editor.getAction('actions.find').run();
    }
  }

  /**
   * Replace in current editor
   */
  replace() {
    const editor = this.editors[this.currentEditor];
    if (editor) {
      editor.getAction('editor.action.startFindReplaceAction').run();
    }
  }

  /**
   * Check if editors are initialized
   * @returns {boolean} - Initialized state
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get current editor name
   * @returns {string} - Editor name
   */
  getCurrentEditor() {
    return this.currentEditor;
  }

  /**
   * Enable auto-sync to canvas
   * @param {DesignerCanvas} canvas - Canvas instance
   * @param {number} delay - Debounce delay in ms (default: 1000)
   */
  enableAutoSync(canvas, delay = 1000) {
    if (!this.initialized) {
      console.warn('[Code Editor] Cannot enable auto-sync - not initialized');
      return;
    }

    this.autoSyncEnabled = true;
    this.autoSyncDelay = delay;
    let autoSyncTimer = null;

    // Add change listener to HTML editor
    if (this.editors.html) {
      this.editors.html.onDidChangeModelContent(() => {
        if (!this.autoSyncEnabled) return;

        // Clear existing timer
        if (autoSyncTimer) {
          clearTimeout(autoSyncTimer);
        }

        // Debounce sync
        autoSyncTimer = setTimeout(() => {
          try {
            this.syncToCanvas(canvas);
            console.log('[Code Editor] Auto-synced to canvas');

            // Show subtle indicator
            const indicator = document.getElementById('auto-sync-indicator');
            if (indicator) {
              indicator.style.opacity = '1';
              setTimeout(() => {
                indicator.style.opacity = '0';
              }, 500);
            }
          } catch (error) {
            console.error('[Code Editor] Auto-sync failed:', error);
          }
        }, this.autoSyncDelay);
      });
    }

    console.log(`[Code Editor] Auto-sync enabled (${delay}ms delay)`);
  }

  /**
   * Disable auto-sync
   */
  disableAutoSync() {
    this.autoSyncEnabled = false;
    console.log('[Code Editor] Auto-sync disabled');
  }

  /**
   * Toggle auto-sync
   * @param {DesignerCanvas} canvas - Canvas instance
   * @returns {boolean} - New auto-sync state
   */
  toggleAutoSync(canvas) {
    if (this.autoSyncEnabled) {
      this.disableAutoSync();
    } else {
      this.enableAutoSync(canvas);
    }
    return this.autoSyncEnabled;
  }

  /**
   * Manual sync button handler
   * @param {DesignerCanvas} canvas - Canvas instance
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   */
  manualSync(canvas, onSuccess, onError) {
    try {
      this.syncToCanvas(canvas);
      console.log('[Code Editor] Manual sync successful');
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[Code Editor] Manual sync failed:', error);
      if (onError) onError(error);
    }
  }

  /**
   * Validate HTML before syncing
   * @param {string} html - HTML to validate
   * @returns {Object} - Validation result {valid: boolean, errors: array}
   */
  validateHTML(html) {
    const errors = [];

    // Basic validation - check for unclosed tags
    const temp = document.createElement('div');
    try {
      temp.innerHTML = html;
    } catch (error) {
      errors.push('Invalid HTML: ' + error.message);
    }

    // Check for dangerous content
    if (html.includes('<script') && !html.includes('server-code')) {
      errors.push('Warning: <script> tags detected. Use Server Code tab instead.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get validation warnings for current HTML
   * @returns {Array} - Array of warning messages
   */
  getValidationWarnings() {
    const html = this.getHTML();
    const validation = this.validateHTML(html);
    return validation.errors;
  }

  /**
   * Dispose all editors (cleanup)
   */
  dispose() {
    Object.values(this.editors).forEach(editor => {
      if (editor && editor.dispose) {
        editor.dispose();
      }
    });

    this.editors = {};
    this.initialized = false;

    console.log('[Code Editor] Disposed');
  }
}

// Make globally accessible
window.CodeEditor = CodeEditor;

console.log('[Code Editor] Module loaded');
