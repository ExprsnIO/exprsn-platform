/**
 * ═══════════════════════════════════════════════════════════════════════
 * Share Manager Component
 * Handles file sharing and permissions
 * ═══════════════════════════════════════════════════════════════════════
 */

const ShareManager = {
  currentFileId: null,
  currentFileName: null,

  /**
   * Show share modal for a file
   */
  async showShareModal(fileId) {
    try {
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
      this.currentFileName = file.name;

      // Show modal
      const modal = new bootstrap.Modal(document.getElementById('shareModal'));
      document.getElementById('shareFileName').textContent = file.name;

      // Clear previous share link
      document.getElementById('shareLink').value = '';

      // Setup create button
      this.setupShareListeners();

      modal.show();
    } catch (error) {
      console.error('Error showing share modal:', error);
      showToast('Failed to load file information', 'error');
    }
  },

  /**
   * Setup share modal listeners
   */
  setupShareListeners() {
    const createBtn = document.getElementById('btnCreateShareLink');
    const copyBtn = document.getElementById('btnCopyLink');

    // Remove old listeners
    const newCreateBtn = createBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newCreateBtn, createBtn);

    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

    // Create share link
    newCreateBtn.addEventListener('click', () => this.createShareLink());

    // Copy link
    newCopyBtn.addEventListener('click', () => {
      const link = document.getElementById('shareLink').value;
      if (link) {
        copyToClipboard(link);
        showToast('Share link copied to clipboard', 'success');
      }
    });
  },

  /**
   * Create share link
   */
  async createShareLink() {
    if (!this.currentFileId) return;

    try {
      showLoading(true);

      // Get permissions
      const permissions = {
        read: true,
        write: document.getElementById('sharePermWrite').checked
      };

      // Get expiration
      const expiresIn = parseInt(document.getElementById('shareExpiration').value);

      // Get max uses
      const maxUses = parseInt(document.getElementById('shareMaxUses').value);

      // Create share link via API
      const response = await fetch(`/api/share/files/${this.currentFileId}/share`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          permissions,
          expiresIn: expiresIn > 0 ? expiresIn : null,
          maxUses: maxUses > 0 ? maxUses : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create share link');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to create share link');
      }

      // Display share link
      const shareUrl = data.shareUrl || `${window.location.origin}/api/share/${data.shareLink.id}`;
      document.getElementById('shareLink').value = shareUrl;

      showToast('Share link created successfully', 'success');
      showLoading(false);
    } catch (error) {
      console.error('Error creating share link:', error);
      showToast('Failed to create share link', 'error');
      showLoading(false);
    }
  }
};
