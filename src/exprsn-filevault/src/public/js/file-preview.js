/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Preview Component
 * Handles in-browser file preview for various file types
 * ═══════════════════════════════════════════════════════════════════════
 */

const FilePreview = {
  currentFileId: null,

  /**
   * Show preview for a file
   */
  async showPreview(fileId) {
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
      this.currentFileId = fileId;

      // Show preview modal
      const modal = new bootstrap.Modal(document.getElementById('previewModal'));
      document.getElementById('previewFileName').textContent = file.name;

      // Setup download button
      document.getElementById('btnDownloadFromPreview').onclick = () => {
        downloadFile(fileId);
      };

      // Render preview based on file type
      await this.renderPreview(file);

      modal.show();
      showLoading(false);
    } catch (error) {
      console.error('Error showing preview:', error);
      showToast('Failed to preview file', 'error');
      showLoading(false);
    }
  },

  /**
   * Render preview based on file type
   */
  async renderPreview(file) {
    const container = document.getElementById('previewBody');
    const mimetype = file.mimetype;

    // Clear previous content
    container.innerHTML = '';

    // Image files
    if (mimetype.startsWith('image/')) {
      await this.previewImage(file, container);
    }
    // Video files
    else if (mimetype.startsWith('video/')) {
      await this.previewVideo(file, container);
    }
    // Audio files
    else if (mimetype.startsWith('audio/')) {
      await this.previewAudio(file, container);
    }
    // PDF files
    else if (mimetype.includes('pdf')) {
      await this.previewPDF(file, container);
    }
    // Text files
    else if (mimetype.startsWith('text/') || this.isTextFile(mimetype)) {
      await this.previewText(file, container);
    }
    // Unsupported file types
    else {
      this.showUnsupportedPreview(file, container);
    }
  },

  /**
   * Preview image
   */
  async previewImage(file, container) {
    const downloadUrl = `/api/files/${file.id}/download`;

    container.innerHTML = `
      <img src="${downloadUrl}" alt="${escapeHtml(file.name)}" class="img-fluid">
    `;
  },

  /**
   * Preview video
   */
  async previewVideo(file, container) {
    const downloadUrl = `/api/files/${file.id}/download`;

    container.innerHTML = `
      <video controls class="w-100">
        <source src="${downloadUrl}" type="${file.mimetype}">
        Your browser does not support the video tag.
      </video>
    `;
  },

  /**
   * Preview audio
   */
  async previewAudio(file, container) {
    const downloadUrl = `/api/files/${file.id}/download`;

    container.innerHTML = `
      <div class="text-center">
        <i class="bi bi-music-note-beamed display-1 text-primary mb-3"></i>
        <h5>${escapeHtml(file.name)}</h5>
        <audio controls class="w-100 mt-3">
          <source src="${downloadUrl}" type="${file.mimetype}">
          Your browser does not support the audio tag.
        </audio>
      </div>
    `;
  },

  /**
   * Preview PDF
   */
  async previewPDF(file, container) {
    const downloadUrl = `/api/files/${file.id}/download`;

    container.innerHTML = `
      <iframe src="${downloadUrl}" class="w-100" style="height: 70vh;"></iframe>
    `;
  },

  /**
   * Preview text file
   */
  async previewText(file, container) {
    try {
      const response = await fetch(`/api/files/${file.id}/download`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const text = await response.text();

      // Syntax highlighting class based on file extension
      const ext = file.name.split('.').pop().toLowerCase();
      const language = this.getLanguageClass(ext);

      container.innerHTML = `
        <pre class="preview-text ${language}" style="white-space: pre-wrap; word-wrap: break-word;"><code>${escapeHtml(text)}</code></pre>
      `;
    } catch (error) {
      console.error('Error previewing text:', error);
      this.showUnsupportedPreview(file, container);
    }
  },

  /**
   * Show unsupported file type message
   */
  showUnsupportedPreview(file, container) {
    const icon = getFileIcon(file.mimetype);

    container.innerHTML = `
      <div class="text-center">
        <i class="bi ${icon.split(' ')[0]} display-1 text-muted mb-3"></i>
        <h5>${escapeHtml(file.name)}</h5>
        <p class="text-muted">Preview not available for this file type</p>
        <p class="small text-muted">Type: ${file.mimetype}</p>
        <p class="small text-muted">Size: ${formatFileSize(file.size)}</p>
        <button class="btn btn-primary mt-3" onclick="downloadFile('${file.id}')">
          <i class="bi bi-download me-2"></i>
          Download File
        </button>
      </div>
    `;
  },

  /**
   * Check if file is text-based
   */
  isTextFile(mimetype) {
    const textMimetypes = [
      'application/json',
      'application/javascript',
      'application/xml',
      'application/x-sh'
    ];

    return textMimetypes.some(type => mimetype.includes(type));
  },

  /**
   * Get language class for syntax highlighting
   */
  getLanguageClass(extension) {
    const languageMap = {
      'js': 'language-javascript',
      'json': 'language-json',
      'html': 'language-html',
      'css': 'language-css',
      'xml': 'language-xml',
      'md': 'language-markdown',
      'py': 'language-python',
      'java': 'language-java',
      'cpp': 'language-cpp',
      'c': 'language-c',
      'cs': 'language-csharp',
      'php': 'language-php',
      'rb': 'language-ruby',
      'go': 'language-go',
      'rs': 'language-rust',
      'sh': 'language-bash',
      'sql': 'language-sql'
    };

    return languageMap[extension] || 'language-plaintext';
  }
};
