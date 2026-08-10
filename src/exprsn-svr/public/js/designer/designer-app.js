/**
 * SVR Visual Designer - Main Application
 * Orchestrates all components and handles application logic
 */

class DesignerApp {
  constructor() {
    this.canvas = null;
    this.propertyEditor = null;
    this.codeEditor = null;
    this.assets = null;
    this.layers = null;
    this.history = [];
    this.historyIndex = -1;
    this.currentPage = null;
    this.viewMode = 'design';
    this.device = 'desktop';
    this.saved = true;
    this.autoSaveInterval = null;

    // Will be initialized after DOM ready
    this.initialized = false;
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('[Designer App] Initializing...');

    try {
      // Create component instances
      this.canvas = new DesignerCanvas();
      this.propertyEditor = new PropertyEditor();
      this.codeEditor = new CodeEditor();
      this.assets = new DesignerAssets(this);
      this.layers = new DesignerLayers(this);
      this.library = new DesignerLibrary(this);
      this.versions = new DesignerVersions(this);

      // Setup event listeners
      this.setupToolbar();
      this.setupViewModes();
      this.setupDeviceModes();
      this.setupZoom();
      this.setupKeyboard();
      this.setupHistory();
      this.setupAutoSave();
      this.setupContextMenu();
      this.setupCodeSync();

      // Load page if editing
      const urlParams = new URLSearchParams(window.location.search);
      const pageId = urlParams.get('id');
      const pageSlug = urlParams.get('slug');

      if (pageId || pageSlug) {
        await this.loadPage(pageId || pageSlug);
      }

      this.initialized = true;
      console.log('[Designer App] Initialized successfully');

      // Show welcome message
      this.showToast('Designer ready!', 'success');
    } catch (error) {
      console.error('[Designer App] Initialization failed:', error);
      this.showToast('Failed to initialize designer', 'error');
    }
  }

  /**
   * Setup toolbar event listeners
   */
  setupToolbar() {
    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.savePage();
    });

    // Publish button
    document.getElementById('publishBtn').addEventListener('click', () => {
      this.publishPage();
    });

    // Undo button
    document.getElementById('undoBtn').addEventListener('click', () => {
      this.undo();
    });

    // Redo button
    document.getElementById('redoBtn').addEventListener('click', () => {
      this.redo();
    });

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.showSettings();
    });

    // Page title/slug auto-generation
    document.getElementById('pageTitle').addEventListener('input', (e) => {
      const slug = this.generateSlug(e.target.value);
      const slugInput = document.getElementById('pageSlug');
      if (!slugInput.dataset.userModified) {
        slugInput.value = slug;
      }
    });

    document.getElementById('pageSlug').addEventListener('input', () => {
      document.getElementById('pageSlug').dataset.userModified = 'true';
    });
  }

  /**
   * Setup view mode switching
   */
  setupViewModes() {
    document.querySelectorAll('.view-mode-toggle button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.getAttribute('data-mode');
        this.setViewMode(mode);
      });
    });
  }

  /**
   * Set view mode
   * @param {string} mode - View mode (design, code, preview)
   */
  setViewMode(mode) {
    const previousMode = this.viewMode;
    this.viewMode = mode;

    // Sync from code editor to canvas if leaving code view
    if (previousMode === 'code' && mode !== 'code') {
      try {
        this.codeEditor.syncToCanvas(this.canvas);
        // Refresh layers after canvas update
        if (this.layers) {
          this.layers.refresh();
        }
        this.showToast('Code synchronized to canvas', 'success');
      } catch (error) {
        console.error('[Designer App] Failed to sync code to canvas:', error);
        this.showToast('Failed to sync code - check console for errors', 'error');
        // Don't prevent mode switch, but warn user
      }
    }

    // Hide all views
    document.getElementById('designerCanvas').style.display = 'none';
    document.getElementById('codeEditorView').style.display = 'none';
    document.getElementById('previewView').style.display = 'none';

    // Show selected view
    switch (mode) {
      case 'design':
        document.getElementById('designerCanvas').style.display = 'block';
        break;

      case 'code':
        document.getElementById('codeEditorView').style.display = 'flex';
        // Sync from canvas to code editor
        this.codeEditor.syncFromCanvas(this.canvas);
        // Refresh layout
        setTimeout(() => {
          Object.values(this.codeEditor.editors).forEach(editor => {
            if (editor && editor.layout) {
              editor.layout();
            }
          });
        }, 100);
        break;

      case 'preview':
        document.getElementById('previewView').style.display = 'block';
        this.updatePreview();
        break;
    }

    // Update button states
    document.querySelectorAll('.view-mode-toggle button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      }
    });

    console.log('[Designer App] View mode:', mode);
  }

  /**
   * Setup device mode switching
   */
  setupDeviceModes() {
    document.querySelectorAll('.responsive-toggle button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const device = e.target.getAttribute('data-device');
        this.setDevice(device);
      });
    });
  }

  /**
   * Set device mode
   * @param {string} device - Device name
   */
  setDevice(device) {
    this.device = device;
    this.canvas.setDevice(device);

    // Update button states
    document.querySelectorAll('.responsive-toggle button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-device') === device) {
        btn.classList.add('active');
      }
    });

    console.log('[Designer App] Device:', device);
  }

  /**
   * Setup zoom controls
   */
  setupZoom() {
    document.getElementById('zoomIn').addEventListener('click', () => {
      this.canvas.zoomIn();
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
      this.canvas.zoomOut();
    });

    document.getElementById('zoomReset').addEventListener('click', () => {
      this.canvas.zoomReset();
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Save (Ctrl+S / Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.savePage();
      }

      // Undo (Ctrl+Z / Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }

      // Redo (Ctrl+Y / Cmd+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  /**
   * Setup history tracking
   */
  setupHistory() {
    // Listen for changes
    document.addEventListener('element-added', () => this.saveState());
    document.addEventListener('element-deleted', () => this.saveState());
    document.addEventListener('property-changed', () => this.saveState());
    document.addEventListener('style-changed', () => this.saveState());
  }

  /**
   * Save current state to history
   */
  saveState() {
    const state = this.canvas.toJSON();

    // Remove future states if we're in the middle of history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Add new state
    this.history.push(state);

    // Limit history size
    if (this.history.length > DesignerConfig.history.maxSteps) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }

    // Mark as unsaved
    this.saved = false;

    // Update buttons
    this.updateHistoryButtons();
  }

  /**
   * Undo last change
   */
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      this.canvas.fromJSON(state);
      this.updateHistoryButtons();
      console.log('[Designer App] Undo');
    }
  }

  /**
   * Redo last undone change
   */
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const state = this.history[this.historyIndex];
      this.canvas.fromJSON(state);
      this.updateHistoryButtons();
      console.log('[Designer App] Redo');
    }
  }

  /**
   * Update undo/redo button states
   */
  updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    undoBtn.disabled = this.historyIndex <= 0;
    redoBtn.disabled = this.historyIndex >= this.history.length - 1;
  }

  /**
   * Setup auto-save
   */
  setupAutoSave() {
    const settings = DesignerConfig.getSettings();

    if (settings.autoSave && DesignerConfig.autoSave.enabled) {
      this.autoSaveInterval = setInterval(() => {
        if (!this.saved && this.currentPage) {
          console.log('[Designer App] Auto-saving...');
          this.autoSavePage();
        }
      }, DesignerConfig.autoSave.interval);
    }
  }

  /**
   * Auto-save page with version snapshot
   */
  async autoSavePage() {
    try {
      await this.savePage(true);

      // Create auto-save version
      if (this.versions && this.currentPage) {
        await this.versions.createVersion('Auto-save', true);

        // Clean up old auto-saves
        await this.designer.pageService?.cleanupAutoSaves(this.currentPage.id);
      }
    } catch (error) {
      console.error('[Designer App] Auto-save failed:', error);
    }
  }

  /**
   * Setup context menu
   */
  setupContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.closest('.context-menu-item').getAttribute('data-action');
        const elementId = menu.getAttribute('data-element-id');
        const element = document.querySelector(`[data-element-id="${elementId}"]`);

        if (element) {
          this.handleContextMenuAction(action, element);
        }
      });
    });
  }

  /**
   * Handle context menu action
   * @param {string} action - Action name
   * @param {HTMLElement} element - Target element
   */
  handleContextMenuAction(action, element) {
    switch (action) {
      case 'edit':
        this.canvas.selectElement(element);
        break;

      case 'duplicate':
        this.canvas.duplicateElement(element);
        break;

      case 'copy':
        this.canvas.copyElement(element);
        this.showToast('Element copied', 'success');
        break;

      case 'paste':
        this.canvas.pasteElement();
        break;

      case 'moveUp':
        if (element.previousElementSibling) {
          element.parentNode.insertBefore(element, element.previousElementSibling);
          this.saveState();
        }
        break;

      case 'moveDown':
        if (element.nextElementSibling) {
          element.parentNode.insertBefore(element.nextElementSibling, element);
          this.saveState();
        }
        break;

      case 'delete':
        this.canvas.deleteElement(element);
        break;
    }
  }

  /**
   * Setup code-to-visual synchronization
   */
  setupCodeSync() {
    // Enable auto-sync with 1.5 second delay
    if (this.codeEditor && this.canvas) {
      this.codeEditor.enableAutoSync(this.canvas, 1500);
    }

    // Manual sync button
    const syncBtn = document.getElementById('code-sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        try {
          this.codeEditor.manualSync(
            this.canvas,
            () => {
              // Success
              if (this.layers) this.layers.refresh();
              this.showToast('Code synchronized successfully', 'success');
            },
            (error) => {
              // Error
              this.showToast('Sync failed: ' + error.message, 'error');
            }
          );
        } catch (error) {
          this.showToast('Sync failed: ' + error.message, 'error');
        }
      });
    }

    // Auto-sync toggle button
    const autoSyncToggle = document.getElementById('auto-sync-toggle');
    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('click', () => {
        const enabled = this.codeEditor.toggleAutoSync(this.canvas);
        autoSyncToggle.classList.toggle('active', enabled);
        autoSyncToggle.querySelector('i').className = enabled ? 'fas fa-sync' : 'fas fa-sync-alt';
        this.showToast(enabled ? 'Auto-sync enabled' : 'Auto-sync disabled', 'info');
      });

      // Set initial state (enabled by default)
      autoSyncToggle.classList.add('active');
    }

    console.log('[Designer App] Code sync setup complete');
  }

  /**
   * Save page
   * @param {boolean} silent - Silent save (no toast)
   */
  async savePage(silent = false) {
    if (!silent) {
      this.showLoading();
    }

    try {
      // Sync code if in code mode
      if (this.viewMode === 'code') {
        this.codeEditor.syncToCanvas(this.canvas);
      }

      // Get all content
      const data = {
        title: document.getElementById('pageTitle').value.trim(),
        slug: document.getElementById('pageSlug').value.trim(),
        description: document.getElementById('pageDescription').value.trim(),
        htmlContent: this.codeEditor.getHTML() || this.canvas.getHTML(),
        cssContent: this.codeEditor.getCSS(),
        javascriptContent: this.codeEditor.getJavaScript(),
        serverCode: this.codeEditor.getServerCode(),
        isStatic: document.getElementById('isStatic').checked,
        isPublic: document.getElementById('isPublic').checked,
        status: document.getElementById('pageStatus').value,
        socketEvents: JSON.parse(document.getElementById('socketEvents').value || '[]'),
        apiRoutes: JSON.parse(document.getElementById('apiRoutes').value || '[]'),
        pageData: {
          canvasData: this.canvas.toJSON()
        }
      };

      // Validate
      if (!data.title) {
        throw new Error('Page title is required');
      }
      if (!data.slug) {
        throw new Error('Page slug is required');
      }

      // Save to API
      const token = DesignerConfig.getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const url = this.currentPage
        ? `/api/pages/${this.currentPage.id}`
        : '/api/pages';

      const method = this.currentPage ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save page');
      }

      // Update current page
      this.currentPage = result.page;
      this.saved = true;

      // Create version snapshot
      if (this.versions && this.currentPage) {
        this.versions.setPageId(this.currentPage.id);
        await this.versions.createVersion('Manual save', false);
      }

      if (!silent) {
        this.showToast('Page saved successfully', 'success');
        this.hideLoading();
      }

      console.log('[Designer App] Page saved:', this.currentPage.id);
    } catch (error) {
      console.error('[Designer App] Save failed:', error);
      if (!silent) {
        this.showToast(error.message, 'error');
        this.hideLoading();
      }
    }
  }

  /**
   * Publish page
   */
  async publishPage() {
    // Save first
    await this.savePage(true);

    if (!this.currentPage) {
      this.showToast('Please save the page first', 'warning');
      return;
    }

    try {
      // Update status to published
      document.getElementById('pageStatus').value = 'published';

      // Save again
      await this.savePage();

      this.showToast('Page published successfully!', 'success');

      console.log('[Designer App] Page published');
    } catch (error) {
      console.error('[Designer App] Publish failed:', error);
      this.showToast('Failed to publish page', 'error');
    }
  }

  /**
   * Load page
   * @param {string} idOrSlug - Page ID or slug
   */
  async loadPage(idOrSlug) {
    this.showLoading();

    try {
      const token = DesignerConfig.getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const response = await fetch(`/api/pages/${idOrSlug}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load page');
      }

      const page = result.page;

      // Set form values
      document.getElementById('pageTitle').value = page.title || '';
      document.getElementById('pageSlug').value = page.slug || '';
      document.getElementById('pageSlug').dataset.userModified = 'true';
      document.getElementById('pageDescription').value = page.description || '';
      document.getElementById('pageStatus').value = page.status || 'draft';
      document.getElementById('isStatic').checked = page.is_static || false;
      document.getElementById('isPublic').checked = page.is_public !== false;
      document.getElementById('socketEvents').value = JSON.stringify(page.socket_events || [], null, 2);
      document.getElementById('apiRoutes').value = JSON.stringify(page.api_routes || [], null, 2);

      // Set code editors
      this.codeEditor.setHTML(page.html_content || '');
      this.codeEditor.setCSS(page.css_content || '');
      this.codeEditor.setJavaScript(page.javascript_content || '');
      this.codeEditor.setServerCode(page.server_code || '');

      // Load canvas
      if (page.page_data && page.page_data.canvasData) {
        this.canvas.fromJSON(page.page_data.canvasData);
      } else if (page.html_content) {
        this.canvas.setHTML(page.html_content);
      }

      this.currentPage = page;
      this.saved = true;

      // Set page ID for version history
      if (this.versions) {
        this.versions.setPageId(page.id);
      }

      this.showToast('Page loaded successfully', 'success');
      this.hideLoading();

      console.log('[Designer App] Page loaded:', page.id);
    } catch (error) {
      console.error('[Designer App] Load failed:', error);
      this.showToast(error.message, 'error');
      this.hideLoading();
    }
  }

  /**
   * Update preview
   */
  updatePreview() {
    const iframe = document.getElementById('previewFrame');
    if (!iframe) return;

    const html = this.codeEditor.getHTML() || this.canvas.getHTML();
    const css = this.codeEditor.getCSS();
    const js = this.codeEditor.getJavaScript();

    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>${css}</style>
</head>
<body>
    ${html}
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const pageId = 'preview';
        const serverData = {};
    </script>
    <script>${js}</script>
</body>
</html>`;

    iframe.srcdoc = fullHTML;
  }

  /**
   * Show settings modal
   */
  showSettings() {
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    modal.show();
  }

  /**
   * Generate slug from title
   * @param {string} title - Page title
   * @returns {string} - Generated slug
   */
  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Show toast notification
   * @param {string} message - Message text
   * @param {string} type - Toast type (success, error, warning, info)
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || this.createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type} fade-in`;

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <i class="fas ${icons[type]} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Create toast container
   * @returns {HTMLElement} - Toast container
   */
  createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * Show notification (alias for showToast)
   */
  showNotification(message, type = 'info') {
    this.showToast(message, type);
  }

  /**
   * Get authentication token
   * @returns {string|null} - Auth token
   */
  getAuthToken() {
    // Try to get token from localStorage
    return localStorage.getItem('authToken') || localStorage.getItem('caToken') || null;
  }

  /**
   * Show loading overlay
   */
  showLoading() {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<i class="fas fa-spinner loading-spinner"></i>';
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Cleanup on page unload
   */
  cleanup() {
    // Clear auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // Dispose code editors
    if (this.codeEditor) {
      this.codeEditor.dispose();
    }

    console.log('[Designer App] Cleanup complete');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.designer = new DesignerApp();
  window.designer.init();

  // Cleanup on unload
  window.addEventListener('beforeunload', (e) => {
    if (window.designer && !window.designer.saved) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }

    window.designer.cleanup();
  });
});

console.log('[Designer App] Module loaded');
