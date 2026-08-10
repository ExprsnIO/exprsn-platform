/**
 * Designer Asset Manager
 * Handles file uploads, asset gallery, and drag-drop asset insertion
 */

class DesignerAssets {
  constructor(designer) {
    this.designer = designer;
    this.assets = [];
    this.selectedAssets = new Set();
    this.uploadQueue = [];
    this.filters = {
      fileType: null,
      search: '',
      tags: []
    };

    this.init();
  }

  /**
   * Initialize asset manager
   */
  init() {
    this.setupUI();
    this.setupEventListeners();
    this.loadAssets();
  }

  /**
   * Setup UI elements
   */
  setupUI() {
    // Get assets panel
    this.panel = document.getElementById('assets-panel');
    if (!this.panel) {
      console.warn('Assets panel not found');
      return;
    }

    // Create asset browser if it doesn't exist
    if (!document.getElementById('asset-browser')) {
      this.createAssetBrowser();
    }

    // Create upload area if it doesn't exist
    if (!document.getElementById('asset-upload-area')) {
      this.createUploadArea();
    }
  }

  /**
   * Create asset browser UI
   */
  createAssetBrowser() {
    const browserHTML = `
      <div id="asset-browser" class="asset-browser">
        <!-- Toolbar -->
        <div class="asset-toolbar">
          <div class="asset-search">
            <i class="fas fa-search"></i>
            <input
              type="text"
              id="asset-search-input"
              placeholder="Search assets..."
              class="form-control form-control-sm"
            />
          </div>
          <div class="asset-filters">
            <select id="asset-type-filter" class="form-select form-select-sm">
              <option value="">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            id="asset-upload-btn"
            class="btn btn-primary btn-sm"
            title="Upload files"
          >
            <i class="fas fa-upload"></i> Upload
          </button>
        </div>

        <!-- Asset Grid -->
        <div id="asset-grid" class="asset-grid">
          <div class="asset-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading assets...</p>
          </div>
        </div>

        <!-- Asset Info Panel -->
        <div id="asset-info" class="asset-info" style="display: none;">
          <div class="asset-info-header">
            <h6>Asset Details</h6>
            <button id="asset-info-close" class="btn-close"></button>
          </div>
          <div class="asset-info-body">
            <img id="asset-info-preview" class="asset-info-preview" />
            <div class="asset-info-details">
              <p><strong>Name:</strong> <span id="asset-info-name"></span></p>
              <p><strong>Type:</strong> <span id="asset-info-type"></span></p>
              <p><strong>Size:</strong> <span id="asset-info-size"></span></p>
              <p><strong>URL:</strong> <code id="asset-info-url"></code></p>
              <button id="asset-copy-url-btn" class="btn btn-sm btn-secondary">
                <i class="fas fa-copy"></i> Copy URL
              </button>
              <button id="asset-delete-btn" class="btn btn-sm btn-danger">
                <i class="fas fa-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.panel.innerHTML = browserHTML;
  }

  /**
   * Create upload area UI
   */
  createUploadArea() {
    const uploadHTML = `
      <div id="asset-upload-modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Upload Assets</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div
                id="asset-dropzone"
                class="asset-dropzone"
              >
                <i class="fas fa-cloud-upload-alt fa-3x"></i>
                <p>Drag and drop files here</p>
                <p class="text-muted">or</p>
                <button id="asset-select-files-btn" class="btn btn-primary">
                  Select Files
                </button>
                <input
                  type="file"
                  id="asset-file-input"
                  multiple
                  style="display: none;"
                  accept="image/*,video/*,.pdf,.doc,.docx"
                />
              </div>
              <div id="asset-upload-queue" class="asset-upload-queue" style="display: none;">
                <!-- Upload items will be added here -->
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button
                id="asset-start-upload-btn"
                class="btn btn-primary"
                style="display: none;"
              >
                Upload Files
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', uploadHTML);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search
    const searchInput = document.getElementById('asset-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value;
        this.filterAssets();
      });
    }

    // Type filter
    const typeFilter = document.getElementById('asset-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.filters.fileType = e.target.value || null;
        this.filterAssets();
      });
    }

    // Upload button
    const uploadBtn = document.getElementById('asset-upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        this.showUploadModal();
      });
    }

    // File input
    const fileInput = document.getElementById('asset-file-input');
    const selectFilesBtn = document.getElementById('asset-select-files-btn');

    if (fileInput && selectFilesBtn) {
      selectFilesBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        this.handleFileSelect(e.target.files);
      });
    }

    // Dropzone
    const dropzone = document.getElementById('asset-dropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        this.handleFileSelect(e.dataTransfer.files);
      });
    }

    // Upload button in modal
    const startUploadBtn = document.getElementById('asset-start-upload-btn');
    if (startUploadBtn) {
      startUploadBtn.addEventListener('click', () => {
        this.uploadFiles();
      });
    }

    // Asset info close button
    const infoCloseBtn = document.getElementById('asset-info-close');
    if (infoCloseBtn) {
      infoCloseBtn.addEventListener('click', () => {
        document.getElementById('asset-info').style.display = 'none';
      });
    }

    // Copy URL button
    const copyUrlBtn = document.getElementById('asset-copy-url-btn');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', () => {
        const url = document.getElementById('asset-info-url').textContent;
        navigator.clipboard.writeText(url);
        this.designer.showNotification('URL copied to clipboard', 'success');
      });
    }

    // Delete button
    const deleteBtn = document.getElementById('asset-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const assetId = deleteBtn.dataset.assetId;
        this.deleteAsset(assetId);
      });
    }
  }

  /**
   * Load assets from API
   */
  async loadAssets() {
    try {
      const response = await fetch('/api/assets', {
        headers: {
          'Authorization': `Bearer ${this.designer.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load assets');
      }

      const data = await response.json();
      this.assets = data.data || [];
      this.renderAssets();
    } catch (error) {
      console.error('Error loading assets:', error);
      this.showError('Failed to load assets');
    }
  }

  /**
   * Filter assets based on current filters
   */
  filterAssets() {
    const filtered = this.assets.filter(asset => {
      // Type filter
      if (this.filters.fileType && asset.file_type !== this.filters.fileType) {
        return false;
      }

      // Search filter
      if (this.filters.search) {
        const search = this.filters.search.toLowerCase();
        const name = asset.file_name.toLowerCase();
        const alt = (asset.alt_text || '').toLowerCase();
        if (!name.includes(search) && !alt.includes(search)) {
          return false;
        }
      }

      return true;
    });

    this.renderAssets(filtered);
  }

  /**
   * Render assets in grid
   */
  renderAssets(assetsToRender = null) {
    const grid = document.getElementById('asset-grid');
    if (!grid) return;

    const assets = assetsToRender || this.assets;

    if (assets.length === 0) {
      grid.innerHTML = `
        <div class="asset-empty">
          <i class="fas fa-images fa-3x"></i>
          <p>No assets found</p>
          <button class="btn btn-primary" onclick="window.designerAssets.showUploadModal()">
            Upload Files
          </button>
        </div>
      `;
      return;
    }

    const assetItems = assets.map(asset => this.createAssetItem(asset)).join('');
    grid.innerHTML = assetItems;

    // Setup drag events for assets
    grid.querySelectorAll('.asset-item').forEach(item => {
      this.setupAssetDrag(item);
    });
  }

  /**
   * Create asset item HTML
   */
  createAssetItem(asset) {
    const isImage = asset.file_type === 'image';
    const thumbnail = isImage ? asset.url : this.getFileTypeIcon(asset.file_type);

    return `
      <div
        class="asset-item"
        data-asset-id="${asset.id}"
        data-asset-url="${asset.url}"
        data-asset-type="${asset.file_type}"
        draggable="true"
      >
        <div class="asset-thumbnail">
          ${isImage ?
            `<img src="${thumbnail}" alt="${asset.alt_text || asset.file_name}" />` :
            `<i class="${thumbnail} fa-3x"></i>`
          }
        </div>
        <div class="asset-name" title="${asset.file_name}">
          ${asset.file_name}
        </div>
        <div class="asset-actions">
          <button class="btn btn-sm btn-primary" onclick="window.designerAssets.insertAsset('${asset.id}')">
            <i class="fas fa-plus"></i>
          </button>
          <button class="btn btn-sm btn-info" onclick="window.designerAssets.showAssetInfo('${asset.id}')">
            <i class="fas fa-info"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Get icon for file type
   */
  getFileTypeIcon(type) {
    const icons = {
      image: 'fas fa-image',
      video: 'fas fa-video',
      document: 'fas fa-file-alt',
      pdf: 'fas fa-file-pdf',
      other: 'fas fa-file'
    };
    return icons[type] || icons.other;
  }

  /**
   * Setup drag events for asset item
   */
  setupAssetDrag(item) {
    item.addEventListener('dragstart', (e) => {
      const assetUrl = item.dataset.assetUrl;
      const assetType = item.dataset.assetType;

      e.dataTransfer.setData('text/plain', assetUrl);
      e.dataTransfer.setData('asset-url', assetUrl);
      e.dataTransfer.setData('asset-type', assetType);
      e.dataTransfer.effectAllowed = 'copy';

      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    item.addEventListener('click', () => {
      this.showAssetInfo(item.dataset.assetId);
    });
  }

  /**
   * Insert asset into canvas
   */
  insertAsset(assetId) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) return;

    // Create appropriate component based on asset type
    let component;
    if (asset.file_type === 'image') {
      component = {
        type: 'img',
        attributes: {
          src: asset.url,
          alt: asset.alt_text || asset.file_name,
          class: 'img-fluid'
        }
      };
    } else if (asset.file_type === 'video') {
      component = {
        type: 'video',
        attributes: {
          src: asset.url,
          controls: true,
          class: 'w-100'
        }
      };
    } else {
      component = {
        type: 'a',
        attributes: {
          href: asset.url,
          download: asset.file_name,
          class: 'btn btn-primary'
        },
        innerHTML: `Download ${asset.file_name}`
      };
    }

    // Add to canvas
    if (this.designer.canvas) {
      this.designer.canvas.addComponent(component);
    }
  }

  /**
   * Show asset info panel
   */
  showAssetInfo(assetId) {
    const asset = this.assets.find(a => a.id === assetId);
    if (!asset) return;

    const infoPanel = document.getElementById('asset-info');
    const preview = document.getElementById('asset-info-preview');

    if (asset.file_type === 'image') {
      preview.src = asset.url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    document.getElementById('asset-info-name').textContent = asset.file_name;
    document.getElementById('asset-info-type').textContent = asset.file_type;
    document.getElementById('asset-info-size').textContent = this.formatFileSize(asset.file_size);
    document.getElementById('asset-info-url').textContent = asset.url;
    document.getElementById('asset-delete-btn').dataset.assetId = asset.id;

    infoPanel.style.display = 'block';
  }

  /**
   * Show upload modal
   */
  showUploadModal() {
    const modal = new bootstrap.Modal(document.getElementById('asset-upload-modal'));
    modal.show();
  }

  /**
   * Handle file selection
   */
  handleFileSelect(files) {
    this.uploadQueue = Array.from(files);
    this.renderUploadQueue();

    document.getElementById('asset-dropzone').style.display = 'none';
    document.getElementById('asset-upload-queue').style.display = 'block';
    document.getElementById('asset-start-upload-btn').style.display = 'block';
  }

  /**
   * Render upload queue
   */
  renderUploadQueue() {
    const queueEl = document.getElementById('asset-upload-queue');
    if (!queueEl) return;

    const items = this.uploadQueue.map((file, index) => `
      <div class="upload-queue-item" data-index="${index}">
        <div class="upload-queue-icon">
          <i class="${this.getFileTypeIcon(this.getFileType(file))}"></i>
        </div>
        <div class="upload-queue-info">
          <div class="upload-queue-name">${file.name}</div>
          <div class="upload-queue-size">${this.formatFileSize(file.size)}</div>
        </div>
        <div class="upload-queue-progress">
          <div class="progress">
            <div class="progress-bar" role="progressbar" style="width: 0%"></div>
          </div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="window.designerAssets.removeFromQueue(${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    queueEl.innerHTML = items;
  }

  /**
   * Remove file from upload queue
   */
  removeFromQueue(index) {
    this.uploadQueue.splice(index, 1);
    if (this.uploadQueue.length === 0) {
      document.getElementById('asset-dropzone').style.display = 'block';
      document.getElementById('asset-upload-queue').style.display = 'none';
      document.getElementById('asset-start-upload-btn').style.display = 'none';
    } else {
      this.renderUploadQueue();
    }
  }

  /**
   * Upload files
   */
  async uploadFiles() {
    const startBtn = document.getElementById('asset-start-upload-btn');
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    for (let i = 0; i < this.uploadQueue.length; i++) {
      const file = this.uploadQueue[i];
      await this.uploadFile(file, i);
    }

    // Reset and close
    this.uploadQueue = [];
    startBtn.disabled = false;
    startBtn.innerHTML = 'Upload Files';

    const modal = bootstrap.Modal.getInstance(document.getElementById('asset-upload-modal'));
    modal.hide();

    // Reload assets
    await this.loadAssets();
    this.designer.showNotification('Files uploaded successfully', 'success');
  }

  /**
   * Upload single file
   */
  async uploadFile(file, index) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isPublic', 'true');

    try {
      const response = await fetch('/api/assets/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.designer.getAuthToken()}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Update progress
      const progressBar = document.querySelector(`[data-index="${index}"] .progress-bar`);
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.classList.add('bg-success');
      }
    } catch (error) {
      console.error('Upload error:', error);
      const progressBar = document.querySelector(`[data-index="${index}"] .progress-bar`);
      if (progressBar) {
        progressBar.classList.add('bg-danger');
      }
    }
  }

  /**
   * Delete asset
   */
  async deleteAsset(assetId) {
    if (!confirm('Are you sure you want to delete this asset?')) {
      return;
    }

    try {
      const response = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.designer.getAuthToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      document.getElementById('asset-info').style.display = 'none';
      await this.loadAssets();
      this.designer.showNotification('Asset deleted', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      this.designer.showNotification('Failed to delete asset', 'error');
    }
  }

  /**
   * Get file type from file
   */
  getFileType(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.includes('pdf')) return 'pdf';
    if (file.type.includes('document') || file.type.includes('text')) return 'document';
    return 'other';
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Show error message
   */
  showError(message) {
    const grid = document.getElementById('asset-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="asset-error">
          <i class="fas fa-exclamation-triangle fa-3x"></i>
          <p>${message}</p>
        </div>
      `;
    }
  }
}

// Make available globally
window.DesignerAssets = DesignerAssets;
