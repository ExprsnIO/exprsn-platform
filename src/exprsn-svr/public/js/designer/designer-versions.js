/**
 * SVR Visual Designer - Version History
 * View, compare, and restore page versions
 */

class DesignerVersions {
  constructor(designer) {
    this.designer = designer;
    this.versions = [];
    this.selectedVersions = []; // For comparison
    this.currentPageId = null;

    this.init();
  }

  /**
   * Initialize version history
   */
  async init() {
    console.log('[Version History] Initializing...');

    // Setup event listeners
    this.setupEventListeners();

    console.log('[Version History] Initialized');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // View history button
    const viewBtn = document.getElementById('view-history-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => this.showHistoryModal());
    }

    // Create version button
    const createBtn = document.getElementById('create-version-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateVersionModal());
    }

    // Refresh versions
    const refreshBtn = document.getElementById('refresh-versions-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadVersions());
    }

    // Toggle auto-saves
    const toggleAutoSaves = document.getElementById('toggle-autosaves-checkbox');
    if (toggleAutoSaves) {
      toggleAutoSaves.addEventListener('change', () => this.loadVersions());
    }
  }

  /**
   * Load version history for current page
   */
  async loadVersions() {
    try {
      if (!this.currentPageId) {
        console.warn('[Version History] No page ID set');
        return;
      }

      const token = this.designer.getAuthToken();
      if (!token) {
        this.designer.showNotification('Authentication required', 'error');
        return;
      }

      const includeAutoSaves = document.getElementById('toggle-autosaves-checkbox')?.checked || false;

      const response = await fetch(
        `/api/pages/${this.currentPageId}/versions?includeAutoSaves=${includeAutoSaves}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      this.versions = result.data || [];

      console.log(`[Version History] Loaded ${this.versions.length} versions`);
      this.renderVersions();
    } catch (error) {
      console.error('[Version History] Failed to load versions:', error);
      this.designer.showNotification('Failed to load version history', 'error');
    }
  }

  /**
   * Render version list
   */
  renderVersions() {
    const container = document.getElementById('versions-list');
    if (!container) {
      console.warn('[Version History] Container not found');
      return;
    }

    if (this.versions.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center p-4">
          <i class="fas fa-history fa-3x text-muted mb-3"></i>
          <p class="text-muted">No versions yet</p>
          <small class="text-muted">Versions are created automatically when you save</small>
        </div>
      `;
      return;
    }

    container.innerHTML = this.versions.map(version => this.renderVersionItem(version)).join('');

    // Attach event listeners
    this.attachVersionListeners(container);
  }

  /**
   * Render single version item
   */
  renderVersionItem(version) {
    const date = new Date(version.created_at);
    const formattedDate = date.toLocaleString();
    const relativeTime = this.getRelativeTime(date);

    const isSelected = this.selectedVersions.includes(version.id);

    return `
      <div class="version-item card mb-2 ${isSelected ? 'border-primary' : ''}" data-version-id="${version.id}">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 mb-2">
                <strong class="version-number">#${version.version_number}</strong>
                ${version.is_auto_save ? '<span class="badge bg-secondary">Auto-save</span>' : '<span class="badge bg-primary">Manual</span>'}
                <small class="text-muted">${relativeTime}</small>
              </div>
              ${version.change_summary ? `<p class="small mb-2">${this.escapeHtml(version.change_summary)}</p>` : ''}
              <div class="d-flex align-items-center gap-3 small text-muted">
                <span><i class="fas fa-file-code"></i> ${this.formatBytes(version.content_size)}</span>
                ${version.has_css ? '<span><i class="fas fa-palette"></i> CSS</span>' : ''}
                ${version.has_javascript ? '<span><i class="fas fa-code"></i> JS</span>' : ''}
                ${version.has_server_code ? '<span><i class="fas fa-server"></i> Server</span>' : ''}
              </div>
              <small class="text-muted d-block mt-1">${formattedDate}</small>
            </div>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-sm btn-outline-secondary view-version-btn" title="View">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline-primary compare-select-btn" title="Select for comparison">
                <i class="fas fa-${isSelected ? 'check-' : ''}square"></i>
              </button>
              <button class="btn btn-sm btn-outline-success restore-version-btn" title="Restore">
                <i class="fas fa-undo"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to version items
   */
  attachVersionListeners(container) {
    container.querySelectorAll('.version-item').forEach(item => {
      const versionId = item.getAttribute('data-version-id');

      // View button
      const viewBtn = item.querySelector('.view-version-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewVersion(versionId);
        });
      }

      // Compare select button
      const compareBtn = item.querySelector('.compare-select-btn');
      if (compareBtn) {
        compareBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleVersionSelection(versionId);
        });
      }

      // Restore button
      const restoreBtn = item.querySelector('.restore-version-btn');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.restoreVersion(versionId);
        });
      }
    });

    // Update compare button state
    this.updateCompareButton();
  }

  /**
   * Toggle version selection for comparison
   */
  toggleVersionSelection(versionId) {
    const index = this.selectedVersions.indexOf(versionId);

    if (index > -1) {
      this.selectedVersions.splice(index, 1);
    } else {
      if (this.selectedVersions.length >= 2) {
        this.designer.showNotification('You can only compare 2 versions at a time', 'warning');
        this.selectedVersions.shift(); // Remove oldest selection
      }
      this.selectedVersions.push(versionId);
    }

    this.renderVersions();
  }

  /**
   * Update compare button state
   */
  updateCompareButton() {
    const compareBtn = document.getElementById('compare-versions-btn');
    if (compareBtn) {
      compareBtn.disabled = this.selectedVersions.length !== 2;

      compareBtn.onclick = () => {
        if (this.selectedVersions.length === 2) {
          this.compareVersions(this.selectedVersions[0], this.selectedVersions[1]);
        }
      };
    }
  }

  /**
   * View a specific version
   */
  async viewVersion(versionId) {
    try {
      const token = this.designer.getAuthToken();
      const response = await fetch(
        `/api/pages/${this.currentPageId}/versions/${versionId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const version = result.data;

      // Show version preview modal
      this.showVersionPreview(version);
    } catch (error) {
      console.error('[Version History] Failed to view version:', error);
      this.designer.showNotification('Failed to load version', 'error');
    }
  }

  /**
   * Show version preview modal
   */
  showVersionPreview(version) {
    let modal = document.getElementById('version-preview-modal');
    if (!modal) {
      this.createVersionPreviewModal();
      modal = document.getElementById('version-preview-modal');
    }

    // Set content
    document.getElementById('preview-version-number').textContent = `Version #${version.version_number}`;
    document.getElementById('preview-version-date').textContent = new Date(version.created_at).toLocaleString();
    document.getElementById('preview-version-summary').textContent = version.change_summary || 'No description';
    document.getElementById('preview-html-content').textContent = version.html_content || '';
    document.getElementById('preview-css-content').textContent = version.css_content || '';
    document.getElementById('preview-js-content').textContent = version.javascript_content || '';

    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
  }

  /**
   * Compare two versions
   */
  async compareVersions(versionId1, versionId2) {
    try {
      const token = this.designer.getAuthToken();
      const response = await fetch(
        `/api/pages/versions/compare?version1=${versionId1}&version2=${versionId2}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      const diff = result.data;

      // Show comparison modal
      this.showComparisonModal(diff);
    } catch (error) {
      console.error('[Version History] Failed to compare versions:', error);
      this.designer.showNotification('Failed to compare versions', 'error');
    }
  }

  /**
   * Show comparison modal
   */
  showComparisonModal(diff) {
    let modal = document.getElementById('version-comparison-modal');
    if (!modal) {
      this.createComparisonModal();
      modal = document.getElementById('version-comparison-modal');
    }

    // Set headers
    document.getElementById('compare-version1-info').textContent =
      `Version #${diff.version1.version_number} (${new Date(diff.version1.created_at).toLocaleString()})`;
    document.getElementById('compare-version2-info').textContent =
      `Version #${diff.version2.version_number} (${new Date(diff.version2.created_at).toLocaleString()})`;

    // Show changes
    const changesContainer = document.getElementById('changes-summary');
    const changes = [];
    if (diff.changes.title) changes.push('Title');
    if (diff.changes.html) changes.push('HTML');
    if (diff.changes.css) changes.push('CSS');
    if (diff.changes.javascript) changes.push('JavaScript');
    if (diff.changes.server_code) changes.push('Server Code');

    changesContainer.innerHTML = changes.length > 0
      ? `<span class="badge bg-warning">${changes.join(', ')} changed</span>`
      : '<span class="badge bg-success">No changes</span>';

    // Show HTML diff
    if (diff.changes.html) {
      document.getElementById('html-diff-old').textContent = diff.content.html.old;
      document.getElementById('html-diff-new').textContent = diff.content.html.new;
    }

    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
  }

  /**
   * Restore version
   */
  async restoreVersion(versionId) {
    if (!confirm('Are you sure you want to restore this version? The current state will be saved as a backup.')) {
      return;
    }

    try {
      const token = this.designer.getAuthToken();
      const response = await fetch(
        `/api/pages/${this.currentPageId}/versions/${versionId}/restore`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      this.designer.showNotification('Version restored successfully!', 'success');

      // Reload the page in designer
      if (this.designer.loadPage) {
        await this.designer.loadPage(this.currentPageId);
      }

      // Reload versions
      await this.loadVersions();
    } catch (error) {
      console.error('[Version History] Failed to restore version:', error);
      this.designer.showNotification('Failed to restore version', 'error');
    }
  }

  /**
   * Create a new version snapshot
   */
  async createVersion(changeSummary, isAutoSave = false) {
    try {
      if (!this.currentPageId) {
        console.warn('[Version History] No page ID set');
        return null;
      }

      const token = this.designer.getAuthToken();
      const response = await fetch(
        `/api/pages/${this.currentPageId}/versions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            changeSummary,
            isAutoSave
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[Version History] Version created:', result.data);

      return result.data;
    } catch (error) {
      console.error('[Version History] Failed to create version:', error);
      return null;
    }
  }

  /**
   * Show history modal
   */
  showHistoryModal() {
    let modal = document.getElementById('version-history-modal');
    if (!modal) {
      this.createHistoryModal();
      modal = document.getElementById('version-history-modal');
    }

    // Load versions
    this.loadVersions();

    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
  }

  /**
   * Show create version modal
   */
  showCreateVersionModal() {
    const summary = prompt('Enter a description for this version:');
    if (summary) {
      this.createVersion(summary, false).then(() => {
        this.designer.showNotification('Version created!', 'success');
        this.loadVersions();
      });
    }
  }

  /**
   * Set current page ID
   */
  setPageId(pageId) {
    this.currentPageId = pageId;
  }

  /**
   * Get relative time
   */
  getRelativeTime(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  /**
   * Format bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create history modal
   */
  createHistoryModal() {
    const modalHTML = `
      <div class="modal fade" id="version-history-modal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Version History</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="form-check">
                  <input type="checkbox" class="form-check-input" id="toggle-autosaves-checkbox">
                  <label class="form-check-label" for="toggle-autosaves-checkbox">
                    Show auto-saves
                  </label>
                </div>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" id="compare-versions-btn" disabled>
                    <i class="fas fa-code-compare"></i> Compare Selected
                  </button>
                  <button class="btn btn-outline-secondary" id="refresh-versions-btn">
                    <i class="fas fa-sync"></i>
                  </button>
                </div>
              </div>
              <div id="versions-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Create version preview modal
   */
  createVersionPreviewModal() {
    const modalHTML = `
      <div class="modal fade" id="version-preview-modal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="preview-version-number">Version #</h5>
                <small class="text-muted" id="preview-version-date"></small>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="mb-3"><strong>Summary:</strong> <span id="preview-version-summary"></span></p>
              <ul class="nav nav-tabs mb-3">
                <li class="nav-item">
                  <a class="nav-link active" data-bs-toggle="tab" href="#preview-html">HTML</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link" data-bs-toggle="tab" href="#preview-css">CSS</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link" data-bs-toggle="tab" href="#preview-js">JavaScript</a>
                </li>
              </ul>
              <div class="tab-content">
                <div class="tab-pane fade show active" id="preview-html">
                  <pre class="bg-light p-3 rounded"><code id="preview-html-content"></code></pre>
                </div>
                <div class="tab-pane fade" id="preview-css">
                  <pre class="bg-light p-3 rounded"><code id="preview-css-content"></code></pre>
                </div>
                <div class="tab-pane fade" id="preview-js">
                  <pre class="bg-light p-3 rounded"><code id="preview-js-content"></code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * Create comparison modal
   */
  createComparisonModal() {
    const modalHTML = `
      <div class="modal fade" id="version-comparison-modal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Compare Versions</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row mb-3">
                <div class="col-6">
                  <strong>Older:</strong> <span id="compare-version1-info"></span>
                </div>
                <div class="col-6">
                  <strong>Newer:</strong> <span id="compare-version2-info"></span>
                </div>
              </div>
              <div class="mb-3">
                <strong>Changes:</strong> <span id="changes-summary"></span>
              </div>
              <div class="row">
                <div class="col-6">
                  <h6>Old HTML</h6>
                  <pre class="bg-light p-2 rounded" style="max-height: 400px; overflow-y: auto;"><code id="html-diff-old"></code></pre>
                </div>
                <div class="col-6">
                  <h6>New HTML</h6>
                  <pre class="bg-light p-2 rounded" style="max-height: 400px; overflow-y: auto;"><code id="html-diff-new"></code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }
}

// Make globally accessible
window.DesignerVersions = DesignerVersions;

console.log('[Version History] Module loaded');
