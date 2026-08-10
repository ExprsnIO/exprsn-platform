/**
 * ═══════════════════════════════════════════════════════════════════════
 * WebDAV Client Component
 * Handles WebDAV configuration and connection
 * ═══════════════════════════════════════════════════════════════════════
 */

const WebDAVClient = {
  /**
   * Initialize WebDAV modal
   */
  init() {
    // Set WebDAV URL
    const webdavUrl = `${window.location.protocol}//${window.location.host}/webdav`;
    const webdavUrlInput = document.getElementById('webdavUrl');
    if (webdavUrlInput) {
      webdavUrlInput.value = webdavUrl;
    }
  },

  /**
   * Generate WebDAV token
   */
  async generateToken() {
    try {
      showLoading(true);

      const response = await fetch('/api/auth/webdav-token', {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to generate WebDAV token');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to generate token');
      }

      // Show token to user
      const token = data.token;
      alert(`Your WebDAV Token:\n\n${token}\n\nUsername: ${data.username || 'your-username'}\nPassword: ${token}\n\nSave this token securely. It will only be shown once.`);

      showToast('WebDAV token generated successfully', 'success');
      showLoading(false);
    } catch (error) {
      console.error('Error generating WebDAV token:', error);
      showToast('Failed to generate WebDAV token. This feature may not be enabled.', 'warning');
      showLoading(false);
    }
  },

  /**
   * Test WebDAV connection
   */
  async testConnection() {
    try {
      showLoading(true);

      const response = await fetch('/webdav', {
        method: 'OPTIONS',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        showToast('WebDAV connection successful', 'success');
      } else {
        throw new Error('Connection failed');
      }

      showLoading(false);
    } catch (error) {
      console.error('WebDAV connection test failed:', error);
      showToast('WebDAV connection test failed', 'error');
      showLoading(false);
    }
  }
};

// Initialize WebDAV when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  WebDAVClient.init();
});
