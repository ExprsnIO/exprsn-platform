/**
 * SVR Visual Designer - Custom Component Library
 * Save, load, and manage user-created reusable components
 */

class DesignerLibrary {
  constructor(designer) {
    this.designer = designer;
    this.components = [];
    this.currentFilter = 'all'; // all, my, public
    this.currentCategory = 'all';
    this.selectedComponent = null;

    this.init();
  }

  /**
   * Initialize component library
   */
  async init() {
    console.log('[Custom Library] Initializing...');

    // Setup UI event listeners
    this.setupEventListeners();

    // Load components
    await this.loadComponents();

    console.log('[Custom Library] Initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Save component button (in toolbar)
    const saveBtn = document.getElementById('save-custom-component-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.showSaveDialog());
    }

    // Filter buttons
    document.querySelectorAll('.library-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filter = e.target.getAttribute('data-filter');
        this.setFilter(filter);
      });
    });

    // Category filter
    const categorySelect = document.getElementById('library-category-filter');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        this.renderComponents();
      });
    }

    // Search
    const searchInput = document.getElementById('library-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchComponents(e.target.value);
        }, 300);
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-library-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadComponents());
    }
  }

  /**
   * Load components from API
   */
  async loadComponents() {
    try {
      const token = this.designer.getAuthToken();
      if (!token) {
        console.warn('[Custom Library] No auth token found');
        this.renderComponents();
        return;
      }

      const response = await fetch('/api/components', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      this.components = result.data || [];

      console.log(`[Custom Library] Loaded ${this.components.length} components`);
      this.renderComponents();
    } catch (error) {
      console.error('[Custom Library] Failed to load components:', error);
      this.designer.showNotification('Failed to load component library', 'error');
    }
  }

  /**
   * Search components by keyword
   */
  async searchComponents(keyword) {
    if (!keyword || keyword.trim().length === 0) {
      this.loadComponents();
      return;
    }

    try {
      const token = this.designer.getAuthToken();
      if (!token) {
        console.warn('[Custom Library] No auth token for search');
        return;
      }

      const response = await fetch(`/api/components/search?q=${encodeURIComponent(keyword)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      this.components = result.data || [];

      console.log(`[Custom Library] Found ${this.components.length} components`);
      this.renderComponents();
    } catch (error) {
      console.error('[Custom Library] Search failed:', error);
    }
  }

  /**
   * Set filter (all, my, public)
   */
  setFilter(filter) {
    this.currentFilter = filter;

    // Update active button
    document.querySelectorAll('.library-filter-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-filter') === filter) {
        btn.classList.add('active');
      }
    });

    this.renderComponents();
  }

  /**
   * Render component library
   */
  renderComponents() {
    const container = document.getElementById('custom-library-list');
    if (!container) {
      console.warn('[Custom Library] Container not found');
      return;
    }

    // Filter components
    let filtered = this.components;

    // Apply ownership filter
    if (this.currentFilter === 'my') {
      const userId = this.designer.currentUser?.id;
      filtered = filtered.filter(c => c.created_by === userId);
    } else if (this.currentFilter === 'public') {
      filtered = filtered.filter(c => c.is_public === true);
    }

    // Apply category filter
    if (this.currentCategory && this.currentCategory !== 'all') {
      filtered = filtered.filter(c => c.category === this.currentCategory);
    }

    // Render
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center p-4">
          <i class="fas fa-cube fa-3x text-muted mb-3"></i>
          <p class="text-muted mb-2">No custom components found</p>
          <small class="text-muted">Save your first component to get started!</small>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(component => this.renderComponentCard(component)).join('');

    // Attach event listeners to cards
    this.attachCardListeners(container);
  }

  /**
   * Attach event listeners to component cards
   */
  attachCardListeners(container) {
    container.querySelectorAll('.library-component-card').forEach(card => {
      const componentId = card.getAttribute('data-component-id');

      // Insert button
      const insertBtn = card.querySelector('.insert-library-component-btn');
      if (insertBtn) {
        insertBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.insertComponent(componentId);
        });
      }

      // Edit button
      const editBtn = card.querySelector('.edit-library-component-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.editComponent(componentId);
        });
      }

      // Delete button
      const deleteBtn = card.querySelector('.delete-library-component-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteComponent(componentId);
        });
      }

      // Click card to view details
      card.addEventListener('click', () => {
        this.viewComponentDetails(componentId);
      });
    });
  }

  /**
   * Render single component card
   */
  renderComponentCard(component) {
    const isOwner = this.designer.currentUser?.id === component.created_by;
    const categoryIcons = {
      navigation: 'compass',
      content: 'align-left',
      forms: 'wpforms',
      data: 'table',
      feedback: 'comment',
      layout: 'th-large',
      media: 'photo-video',
      other: 'puzzle-piece'
    };

    const icon = categoryIcons[component.category] || 'puzzle-piece';

    return `
      <div class="library-component-card card mb-2" data-component-id="${component.id}">
        <div class="card-body p-3">
          <div class="d-flex align-items-start justify-content-between">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fas fa-${icon} text-primary"></i>
                <h6 class="mb-0">${this.escapeHtml(component.name)}</h6>
              </div>
              <p class="small text-muted mb-2">${this.escapeHtml(component.description || 'No description')}</p>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="badge badge-sm ${component.is_public ? 'bg-success' : 'bg-secondary'}">
                  <i class="fas fa-${component.is_public ? 'globe' : 'lock'}"></i>
                  ${component.is_public ? 'Public' : 'Private'}
                </span>
                <span class="badge badge-sm bg-light text-dark">
                  ${component.category}
                </span>
                <small class="text-muted">
                  <i class="fas fa-download"></i> ${component.uses_count || 0} uses
                </small>
              </div>
            </div>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-sm btn-primary insert-library-component-btn" title="Insert into canvas">
                <i class="fas fa-plus"></i>
              </button>
              ${isOwner ? `
                <button class="btn btn-sm btn-outline-secondary edit-library-component-btn" title="Edit">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-library-component-btn" title="Delete">
                  <i class="fas fa-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show save component dialog
   */
  showSaveDialog() {
    // Check if element is selected
    const selectedElement = this.designer.canvas?.selectedElement;
    if (!selectedElement) {
      this.designer.showNotification('Please select an element to save as component', 'warning');
      return;
    }

    // Get element HTML (remove canvas-specific attributes)
    const cloned = selectedElement.cloneNode(true);
    cloned.classList.remove('canvas-element', 'selected');
    cloned.removeAttribute('data-element-id');
    cloned.querySelectorAll('[data-no-export]').forEach(el => el.remove());
    const html = cloned.outerHTML;

    // Show modal
    const modal = document.getElementById('save-library-component-modal');
    if (!modal) {
      // Create modal dynamically
      this.createSaveModal();
      return this.showSaveDialog(); // Retry
    }

    // Reset form
    document.getElementById('library-component-name').value = '';
    document.getElementById('library-component-description').value = '';
    document.getElementById('library-component-category').value = 'other';
    document.getElementById('library-component-tags').value = '';
    document.getElementById('library-component-public').checked = false;

    // Store HTML for saving
    this.pendingComponentHTML = html;

    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();

    // Handle save button
    const saveBtn = document.getElementById('confirm-save-library-component-btn');
    const newHandler = async () => {
      await this.saveComponent();
      bootstrapModal.hide();
      saveBtn.removeEventListener('click', newHandler);
    };
    saveBtn.addEventListener('click', newHandler);
  }

  /**
   * Create save modal dynamically
   */
  createSaveModal() {
    const modalHTML = `
      <div class="modal fade" id="save-library-component-modal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Save Custom Component</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Component Name *</label>
                <input type="text" class="form-control" id="library-component-name" placeholder="e.g. Hero Section">
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea class="form-control" id="library-component-description" rows="2" placeholder="Describe what this component does..."></textarea>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Category</label>
                  <select class="form-select" id="library-component-category">
                    <option value="layout">Layout</option>
                    <option value="navigation">Navigation</option>
                    <option value="content">Content</option>
                    <option value="forms">Forms</option>
                    <option value="data">Data</option>
                    <option value="feedback">Feedback</option>
                    <option value="media">Media</option>
                    <option value="other" selected>Other</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Tags</label>
                  <input type="text" class="form-control" id="library-component-tags" placeholder="tag1, tag2, tag3">
                  <small class="text-muted">Comma-separated</small>
                </div>
              </div>
              <div class="form-check">
                <input type="checkbox" class="form-check-input" id="library-component-public">
                <label class="form-check-label" for="library-component-public">
                  Make this component public (visible to all users)
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="confirm-save-library-component-btn">
                <i class="fas fa-save"></i> Save Component
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Save component to database
   */
  async saveComponent() {
    try {
      const name = document.getElementById('library-component-name').value.trim();
      const description = document.getElementById('library-component-description').value.trim();
      const category = document.getElementById('library-component-category').value;
      const tagsStr = document.getElementById('library-component-tags').value.trim();
      const isPublic = document.getElementById('library-component-public').checked;

      // Validation
      if (!name) {
        this.designer.showNotification('Component name is required', 'error');
        return;
      }

      if (!this.pendingComponentHTML) {
        this.designer.showNotification('No component HTML to save', 'error');
        return;
      }

      // Parse tags
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

      // Extract CSS from selected element
      const selectedElement = this.designer.canvas?.selectedElement;
      let css = '';
      let javascript = '';

      if (selectedElement) {
        // Get inline style
        const inlineStyle = selectedElement.getAttribute('style');
        if (inlineStyle) {
          css = `.custom-component {\n  ${inlineStyle.replace(/;/g, ';\n  ')}\n}`;
        }

        // Get scripts (if any)
        const scripts = selectedElement.querySelectorAll('script');
        if (scripts.length > 0) {
          javascript = Array.from(scripts).map(s => s.textContent).join('\n');
        }
      }

      // Create component
      const token = this.designer.getAuthToken();
      if (!token) {
        this.designer.showNotification('Authentication required', 'error');
        return;
      }

      const response = await fetch('/api/components', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          description,
          category,
          tags,
          isPublic,
          html: this.pendingComponentHTML,
          css,
          javascript
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[Custom Library] Component saved:', result.data);

      this.designer.showNotification('Component saved successfully!', 'success');
      this.pendingComponentHTML = null;
      this.loadComponents();
    } catch (error) {
      console.error('[Custom Library] Failed to save component:', error);
      this.designer.showNotification(`Failed to save: ${error.message}`, 'error');
    }
  }

  /**
   * Insert component into canvas
   */
  async insertComponent(componentId) {
    try {
      const token = this.designer.getAuthToken();
      if (!token) {
        this.designer.showNotification('Authentication required', 'error');
        return;
      }

      // Fetch component details
      const response = await fetch(`/api/components/${componentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const component = result.data;

      // Create element from HTML
      const temp = document.createElement('div');
      temp.innerHTML = component.html;
      const element = temp.firstElementChild;

      if (!element) {
        throw new Error('Invalid component HTML');
      }

      // Add canvas-specific attributes
      const id = 'elem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      element.setAttribute('data-element-id', id);
      element.classList.add('canvas-element');

      // Add to canvas
      if (this.designer.canvas) {
        const canvas = document.getElementById('canvasDropzone');
        if (canvas) {
          canvas.appendChild(element);

          // Trigger canvas update
          if (this.designer.layers) {
            this.designer.layers.refresh();
          }

          this.designer.showNotification(`Component "${component.name}" inserted`, 'success');

          // Increment usage count
          fetch(`/api/components/${componentId}/render`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ props: {} })
          }).catch(err => console.warn('Failed to increment usage:', err));
        }
      }
    } catch (error) {
      console.error('[Custom Library] Failed to insert component:', error);
      this.designer.showNotification('Failed to insert component', 'error');
    }
  }

  /**
   * Edit component
   */
  async editComponent(componentId) {
    try {
      const token = this.designer.getAuthToken();
      if (!token) {
        this.designer.showNotification('Authentication required', 'error');
        return;
      }

      // Fetch component
      const response = await fetch(`/api/components/${componentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const component = result.data;

      // Create edit modal if doesn't exist
      let modal = document.getElementById('edit-library-component-modal');
      if (!modal) {
        this.createEditModal();
        modal = document.getElementById('edit-library-component-modal');
      }

      // Populate form
      document.getElementById('edit-library-component-id').value = component.id;
      document.getElementById('edit-library-component-name').value = component.name;
      document.getElementById('edit-library-component-description').value = component.description || '';
      document.getElementById('edit-library-component-category').value = component.category;
      document.getElementById('edit-library-component-tags').value = (component.tags || []).join(', ');
      document.getElementById('edit-library-component-public').checked = component.is_public;

      // Show modal
      const bootstrapModal = new bootstrap.Modal(modal);
      bootstrapModal.show();

      // Handle update button
      const updateBtn = document.getElementById('update-library-component-btn');
      const newHandler = async () => {
        await this.updateComponent(component.id);
        bootstrapModal.hide();
        updateBtn.removeEventListener('click', newHandler);
      };
      updateBtn.addEventListener('click', newHandler);
    } catch (error) {
      console.error('[Custom Library] Failed to edit component:', error);
      this.designer.showNotification('Failed to load component for editing', 'error');
    }
  }

  /**
   * Create edit modal dynamically
   */
  createEditModal() {
    const modalHTML = `
      <div class="modal fade" id="edit-library-component-modal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Edit Custom Component</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="edit-library-component-id">
              <div class="mb-3">
                <label class="form-label">Component Name *</label>
                <input type="text" class="form-control" id="edit-library-component-name">
              </div>
              <div class="mb-3">
                <label class="form-label">Description</label>
                <textarea class="form-control" id="edit-library-component-description" rows="2"></textarea>
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Category</label>
                  <select class="form-select" id="edit-library-component-category">
                    <option value="layout">Layout</option>
                    <option value="navigation">Navigation</option>
                    <option value="content">Content</option>
                    <option value="forms">Forms</option>
                    <option value="data">Data</option>
                    <option value="feedback">Feedback</option>
                    <option value="media">Media</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Tags</label>
                  <input type="text" class="form-control" id="edit-library-component-tags">
                  <small class="text-muted">Comma-separated</small>
                </div>
              </div>
              <div class="form-check">
                <input type="checkbox" class="form-check-input" id="edit-library-component-public">
                <label class="form-check-label" for="edit-library-component-public">
                  Make this component public
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="update-library-component-btn">
                <i class="fas fa-save"></i> Update Component
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Update component
   */
  async updateComponent(componentId) {
    try {
      const name = document.getElementById('edit-library-component-name').value.trim();
      const description = document.getElementById('edit-library-component-description').value.trim();
      const category = document.getElementById('edit-library-component-category').value;
      const tagsStr = document.getElementById('edit-library-component-tags').value.trim();
      const isPublic = document.getElementById('edit-library-component-public').checked;

      if (!name) {
        this.designer.showNotification('Component name is required', 'error');
        return;
      }

      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

      const token = this.designer.getAuthToken();
      const response = await fetch(`/api/components/${componentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          description,
          category,
          tags,
          is_public: isPublic
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      this.designer.showNotification('Component updated successfully!', 'success');
      this.loadComponents();
    } catch (error) {
      console.error('[Custom Library] Failed to update component:', error);
      this.designer.showNotification(`Failed to update: ${error.message}`, 'error');
    }
  }

  /**
   * Delete component
   */
  async deleteComponent(componentId) {
    if (!confirm('Are you sure you want to delete this component?')) {
      return;
    }

    try {
      const token = this.designer.getAuthToken();
      if (!token) {
        this.designer.showNotification('Authentication required', 'error');
        return;
      }

      const response = await fetch(`/api/components/${componentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      this.designer.showNotification('Component deleted successfully', 'success');
      this.loadComponents();
    } catch (error) {
      console.error('[Custom Library] Failed to delete component:', error);
      this.designer.showNotification(`Failed to delete: ${error.message}`, 'error');
    }
  }

  /**
   * View component details
   */
  viewComponentDetails(componentId) {
    const component = this.components.find(c => c.id === componentId);
    if (!component) return;

    console.log('[Custom Library] Viewing component:', component);
    // TODO: Show detailed view modal with HTML preview
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Make globally accessible
window.DesignerLibrary = DesignerLibrary;

console.log('[Custom Library] Module loaded');
