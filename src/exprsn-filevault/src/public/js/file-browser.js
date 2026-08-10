/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Browser Component
 * Handles file listing, filtering, and display
 * ═══════════════════════════════════════════════════════════════════════
 */

const FileBrowser = {
  files: [],
  directories: [],
  currentFilter: null,

  /**
   * Load files for current path
   */
  async loadFiles() {
    this.showLoadingState();

    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(Dashboard.currentPath)}&sort=${Dashboard.currentSort}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to load files');
      }

      const data = await response.json();

      if (data.success) {
        this.files = data.files || [];
        this.directories = data.directories || [];
        this.render();
        updateBreadcrumb(Dashboard.currentPath);
      } else {
        throw new Error(data.message || 'Failed to load files');
      }
    } catch (error) {
      console.error('Error loading files:', error);
      this.showEmptyState();
      showToast('Failed to load files. Using demo data.', 'warning');

      // Load demo data for testing
      this.loadDemoData();
    }
  },

  /**
   * Load demo data for testing
   */
  loadDemoData() {
    this.files = [
      {
        id: '1',
        name: 'Project Proposal.pdf',
        mimetype: 'application/pdf',
        size: 2457600,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: '2',
        name: 'Vacation Photo.jpg',
        mimetype: 'image/jpeg',
        size: 4536320,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
        thumbnailUrl: 'https://via.placeholder.com/300x200/0d6efd/ffffff?text=Vacation'
      },
      {
        id: '3',
        name: 'Meeting Notes.txt',
        mimetype: 'text/plain',
        size: 8192,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString()
      },
      {
        id: '4',
        name: 'Budget 2024.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 524288,
        createdAt: new Date(Date.now() - 259200000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: '5',
        name: 'demo-video.mp4',
        mimetype: 'video/mp4',
        size: 15728640,
        createdAt: new Date(Date.now() - 432000000).toISOString(),
        updatedAt: new Date(Date.now() - 432000000).toISOString()
      },
      {
        id: '6',
        name: 'app.js',
        mimetype: 'application/javascript',
        size: 16384,
        createdAt: new Date(Date.now() - 10800000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString()
      }
    ];

    this.directories = [
      {
        id: 'dir1',
        name: 'Documents',
        createdAt: new Date(Date.now() - 2592000000).toISOString(),
        fileCount: 12
      },
      {
        id: 'dir2',
        name: 'Photos',
        createdAt: new Date(Date.now() - 1296000000).toISOString(),
        fileCount: 45
      }
    ];

    this.render();
  },

  /**
   * Render files in current view
   */
  render() {
    if (this.files.length === 0 && this.directories.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideLoadingState();
    this.hideEmptyState();

    if (Dashboard.currentView === 'grid') {
      this.renderGridView();
    } else {
      this.renderListView();
    }
  },

  /**
   * Render grid view
   */
  renderGridView() {
    const container = document.getElementById('gridView');
    let html = '';

    // Render directories first
    this.directories.forEach(dir => {
      html += this.createGridItem(dir, true);
    });

    // Render files
    this.files.forEach(file => {
      html += this.createGridItem(file, false);
    });

    container.innerHTML = html;
    this.attachEventListeners();
  },

  /**
   * Create grid item HTML
   */
  createGridItem(item, isDirectory) {
    const icon = isDirectory ? 'bi-folder-fill file-folder' : getFileIcon(item.mimetype);
    const size = isDirectory ? `${item.fileCount || 0} items` : formatFileSize(item.size);
    const thumbnail = item.thumbnailUrl && !isDirectory ?
      `<img src="${item.thumbnailUrl}" class="file-thumbnail" alt="${escapeHtml(item.name)}">` :
      `<i class="bi ${icon} file-icon" aria-hidden="true"></i>`;

    return `
      <div class="col">
        <div class="file-item card h-100" data-file-id="${item.id}" data-is-directory="${isDirectory}">
          <!-- Selection checkbox -->
          <div class="file-select-checkbox">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" value="${item.id}" aria-label="Select ${escapeHtml(item.name)}">
            </div>
          </div>

          <!-- Quick actions -->
          <div class="file-actions">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-light btn-sm" data-action="download" title="Download" aria-label="Download ${escapeHtml(item.name)}">
                <i class="bi bi-download" aria-hidden="true"></i>
              </button>
              <button class="btn btn-light btn-sm" data-action="share" title="Share" aria-label="Share ${escapeHtml(item.name)}">
                <i class="bi bi-share" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <!-- File content -->
          <div class="card-body text-center">
            ${thumbnail}
            <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="file-meta">
              <small class="text-muted">${size}</small>
              <br>
              <small class="text-muted">${formatDate(item.updatedAt || item.createdAt)}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render list view
   */
  renderListView() {
    const tbody = document.getElementById('listViewBody');
    let html = '';

    // Render directories first
    this.directories.forEach(dir => {
      html += this.createListItem(dir, true);
    });

    // Render files
    this.files.forEach(file => {
      html += this.createListItem(file, false);
    });

    tbody.innerHTML = html;
    this.attachEventListeners();
  },

  /**
   * Create list item HTML
   */
  createListItem(item, isDirectory) {
    const icon = isDirectory ? 'bi-folder-fill file-folder' : getFileIcon(item.mimetype);
    const size = isDirectory ? `${item.fileCount || 0} items` : formatFileSize(item.size);
    const type = isDirectory ? 'Folder' : this.getFileType(item.mimetype);

    return `
      <tr class="file-item" data-file-id="${item.id}" data-is-directory="${isDirectory}">
        <td>
          <div class="form-check">
            <input class="form-check-input file-select-checkbox" type="checkbox" value="${item.id}"
                   aria-label="Select ${escapeHtml(item.name)}">
          </div>
        </td>
        <td>
          <i class="bi ${icon} file-icon me-2" aria-hidden="true"></i>
          <strong>${escapeHtml(item.name)}</strong>
        </td>
        <td>
          <small class="text-muted">${formatDate(item.updatedAt || item.createdAt)}</small>
        </td>
        <td>
          <small class="text-muted">${size}</small>
        </td>
        <td>
          <small class="text-muted">${type}</small>
        </td>
        <td class="text-end">
          <div class="btn-group btn-group-sm" role="group" aria-label="File actions">
            ${!isDirectory ? `
              <button class="btn btn-outline-secondary" data-action="preview" title="Preview" aria-label="Preview ${escapeHtml(item.name)}">
                <i class="bi bi-eye" aria-hidden="true"></i>
              </button>
            ` : ''}
            <button class="btn btn-outline-secondary" data-action="download" title="Download" aria-label="Download ${escapeHtml(item.name)}">
              <i class="bi bi-download" aria-hidden="true"></i>
            </button>
            <button class="btn btn-outline-secondary" data-action="share" title="Share" aria-label="Share ${escapeHtml(item.name)}">
              <i class="bi bi-share" aria-hidden="true"></i>
            </button>
            <button class="btn btn-outline-danger" data-action="delete" title="Delete" aria-label="Delete ${escapeHtml(item.name)}">
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  /**
   * Attach event listeners to file items
   */
  attachEventListeners() {
    document.querySelectorAll('.file-item').forEach(item => {
      const fileId = item.dataset.fileId;
      const isDirectory = item.dataset.isDirectory === 'true';

      // Double-click to open
      item.addEventListener('dblclick', (e) => {
        if (e.target.closest('button') || e.target.closest('.file-select-checkbox')) {
          return;
        }

        if (isDirectory) {
          this.openDirectory(fileId);
        } else {
          FilePreview.showPreview(fileId);
        }
      });

      // Single click to select (in grid view)
      if (Dashboard.currentView === 'grid') {
        item.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('.file-select-checkbox')) {
            return;
          }

          if (Dashboard.selectMode) {
            toggleFileSelection(fileId);
          }
        });
      }

      // Checkbox selection
      const checkbox = item.querySelector('.file-select-checkbox input, .file-select-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          toggleFileSelection(fileId);
        });
      }

      // Action buttons
      item.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          handleFileAction(action, fileId);
        });
      });
    });
  },

  /**
   * Open directory
   */
  openDirectory(dirId) {
    const dir = this.directories.find(d => d.id === dirId);
    if (!dir) return;

    Dashboard.currentPath = Dashboard.currentPath === '/' ? `/${dir.name}` : `${Dashboard.currentPath}/${dir.name}`;
    this.loadFiles();
  },

  /**
   * Get file type label
   */
  getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'Image';
    if (mimetype.startsWith('video/')) return 'Video';
    if (mimetype.startsWith('audio/')) return 'Audio';
    if (mimetype.includes('pdf')) return 'PDF';
    if (mimetype.includes('word')) return 'Document';
    if (mimetype.includes('excel')) return 'Spreadsheet';
    if (mimetype.includes('powerpoint')) return 'Presentation';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return 'Archive';
    if (mimetype.includes('javascript')) return 'JavaScript';
    if (mimetype.includes('json')) return 'JSON';
    if (mimetype.startsWith('text/')) return 'Text';
    return 'File';
  },

  /**
   * Apply filter
   */
  applyFilter(filter) {
    this.currentFilter = filter;

    // Update active filter in UI
    document.querySelectorAll('[data-filter]').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.filter === filter) {
        link.classList.add('active');
      }
    });

    let filteredFiles;

    switch (filter) {
      case 'images':
        filteredFiles = this.files.filter(f => f.mimetype.startsWith('image/'));
        break;
      case 'videos':
        filteredFiles = this.files.filter(f => f.mimetype.startsWith('video/'));
        break;
      case 'documents':
        filteredFiles = this.files.filter(f =>
          f.mimetype.includes('pdf') ||
          f.mimetype.includes('word') ||
          f.mimetype.includes('excel') ||
          f.mimetype.includes('powerpoint') ||
          f.mimetype.startsWith('text/')
        );
        break;
      case 'code':
        filteredFiles = this.files.filter(f =>
          f.mimetype.includes('javascript') ||
          f.mimetype.includes('json') ||
          f.mimetype.includes('xml') ||
          f.mimetype.includes('html') ||
          f.mimetype.includes('css')
        );
        break;
      default:
        filteredFiles = this.files;
    }

    // Temporarily replace files and render
    const originalFiles = this.files;
    const originalDirs = this.directories;

    this.files = filteredFiles;
    if (filter) {
      this.directories = []; // Don't show directories when filtering
    }

    this.render();

    // Restore original data
    this.files = originalFiles;
    this.directories = originalDirs;
  },

  /**
   * Search files
   */
  async searchFiles(query) {
    this.showLoadingState();

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      if (data.success) {
        this.files = data.results || [];
        this.directories = [];
        this.render();
      }
    } catch (error) {
      console.error('Error searching files:', error);
      showToast('Search failed', 'error');

      // Fallback: local search
      const lowerQuery = query.toLowerCase();
      this.files = this.files.filter(f => f.name.toLowerCase().includes(lowerQuery));
      this.directories = this.directories.filter(d => d.name.toLowerCase().includes(lowerQuery));
      this.render();
    }
  },

  /**
   * Load recent files
   */
  async loadRecentFiles() {
    this.showLoadingState();

    try {
      const response = await fetch('/api/files?sort=-updatedAt&limit=20', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to load recent files');
      }

      const data = await response.json();

      if (data.success) {
        this.files = data.files || [];
        this.directories = [];
        this.render();
      }
    } catch (error) {
      console.error('Error loading recent files:', error);
      showToast('Failed to load recent files', 'error');
    }
  },

  /**
   * Load shared files
   */
  async loadSharedFiles() {
    this.showLoadingState();

    try {
      const response = await fetch('/api/share/shared-with-me', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to load shared files');
      }

      const data = await response.json();

      if (data.success) {
        this.files = data.files || [];
        this.directories = [];
        this.render();
      }
    } catch (error) {
      console.error('Error loading shared files:', error);
      this.showEmptyState('No shared files yet');
    }
  },

  /**
   * Load favorites
   */
  async loadFavorites() {
    this.showLoadingState();
    // TODO: Implement favorites API
    this.showEmptyState('No favorites yet');
  },

  /**
   * Load trash
   */
  async loadTrash() {
    this.showLoadingState();
    // TODO: Implement trash API
    this.showEmptyState('Trash is empty');
  },

  /**
   * Show loading state
   */
  showLoadingState() {
    document.getElementById('loadingState').classList.remove('d-none');
    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('gridView').innerHTML = '';
    document.getElementById('listViewBody').innerHTML = '';
  },

  /**
   * Hide loading state
   */
  hideLoadingState() {
    document.getElementById('loadingState').classList.add('d-none');
  },

  /**
   * Show empty state
   */
  showEmptyState(message = 'No files yet') {
    document.getElementById('loadingState').classList.add('d-none');
    document.getElementById('emptyState').classList.remove('d-none');
    document.getElementById('gridView').innerHTML = '';
    document.getElementById('listViewBody').innerHTML = '';

    const emptyState = document.getElementById('emptyState');
    const messageEl = emptyState.querySelector('h3');
    if (messageEl) {
      messageEl.textContent = message;
    }
  },

  /**
   * Hide empty state
   */
  hideEmptyState() {
    document.getElementById('emptyState').classList.add('d-none');
  }
};
