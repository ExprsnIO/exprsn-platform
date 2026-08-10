/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Editor Component
 * Handles in-browser text/code editing
 * ═══════════════════════════════════════════════════════════════════════
 */

const FileEditor = {
  currentFileId: null,
  currentFileName: null,
  originalContent: null,
  hasUnsavedChanges: false,

  /**
   * Open file in editor
   */
  async openEditor(fileId) {
    try {
      showLoading(true);

      // Get file metadata
      const response = await fetch(`/api/files/${fileId}`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to load file');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to load file');
      }

      const file = data.file;

      // Check if file is editable (text-based)
      if (!this.isEditableFile(file.mimetype)) {
        showToast('This file type cannot be edited in the browser', 'warning');
        showLoading(false);
        return;
      }

      // Download file content
      const contentResponse = await fetch(`/api/files/${fileId}/download`, {
        headers: getAuthHeaders()
      });

      if (!contentResponse.ok) {
        throw new Error('Failed to download file content');
      }

      const content = await contentResponse.text();

      // Store current state
      this.currentFileId = fileId;
      this.currentFileName = file.name;
      this.originalContent = content;
      this.hasUnsavedChanges = false;

      // Show editor modal
      this.showEditorModal(file.name, content);

      showLoading(false);
    } catch (error) {
      console.error('Error opening editor:', error);
      showToast('Failed to open file in editor', 'error');
      showLoading(false);
    }
  },

  /**
   * Check if file type is editable
   */
  isEditableFile(mimetype) {
    const editableMimetypes = [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'text/xml',
      'application/json',
      'application/javascript',
      'application/xml',
      'text/markdown',
      'text/csv'
    ];

    return editableMimetypes.some(type => mimetype.includes(type)) ||
           mimetype.startsWith('text/');
  },

  /**
   * Show editor modal
   */
  showEditorModal(filename, content) {
    const modal = new bootstrap.Modal(document.getElementById('editorModal'));
    const editor = document.getElementById('fileEditor');
    const filenameEl = document.getElementById('editorFileName');

    filenameEl.textContent = filename;
    editor.value = content;

    // Setup event listeners
    this.setupEditorListeners();

    modal.show();

    // Focus editor
    setTimeout(() => editor.focus(), 100);
  },

  /**
   * Setup editor event listeners
   */
  setupEditorListeners() {
    const editor = document.getElementById('fileEditor');
    const saveBtn = document.getElementById('btnSaveFile');

    // Track changes
    editor.addEventListener('input', () => {
      this.hasUnsavedChanges = editor.value !== this.originalContent;
      this.updateSaveIndicator();
    });

    // Save button
    saveBtn.addEventListener('click', () => this.saveFile());

    // Keyboard shortcut (Ctrl/Cmd + S)
    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveFile();
      }
    });

    // Warn before closing with unsaved changes
    const modal = document.getElementById('editorModal');
    modal.addEventListener('hide.bs.modal', (e) => {
      if (this.hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
          e.preventDefault();
        } else {
          this.reset();
        }
      } else {
        this.reset();
      }
    });
  },

  /**
   * Update save indicator
   */
  updateSaveIndicator() {
    const saved = document.getElementById('editorSaved');
    const unsaved = document.getElementById('editorUnsaved');

    if (this.hasUnsavedChanges) {
      saved.style.display = 'none';
      unsaved.style.display = 'inline-block';
    } else {
      saved.style.display = 'inline-block';
      unsaved.style.display = 'none';
    }
  },

  /**
   * Save file
   */
  async saveFile() {
    if (!this.currentFileId) return;

    const editor = document.getElementById('fileEditor');
    const content = editor.value;

    try {
      showLoading(true);

      // Convert content to blob
      const blob = new Blob([content], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, this.currentFileName);

      // Upload new version
      const response = await fetch(`/api/files/${this.currentFileId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${Dashboard.token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to save file');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to save file');
      }

      // Update state
      this.originalContent = content;
      this.hasUnsavedChanges = false;
      this.updateSaveIndicator();

      showToast('File saved successfully', 'success');
      showLoading(false);

      // Refresh file list
      FileBrowser.loadFiles();
    } catch (error) {
      console.error('Error saving file:', error);
      showToast('Failed to save file', 'error');
      showLoading(false);
    }
  },

  /**
   * Reset editor state
   */
  reset() {
    this.currentFileId = null;
    this.currentFileName = null;
    this.originalContent = null;
    this.hasUnsavedChanges = false;

    const editor = document.getElementById('fileEditor');
    editor.value = '';

    this.updateSaveIndicator();
  }
};
