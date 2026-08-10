/**
 * FileVault (File Management) Configuration Manager
 *
 * Provides UI and API interaction for configuring the FileVault service,
 * managing storage backends, file features, and security settings.
 */

class FileVaultConfigManager {
  constructor() {
    this.filevaultConfig = null;
  }

  /**
   * Load FileVault configuration from the API
   */
  async loadFileVaultConfiguration() {
    const container = document.getElementById('filevaultConfigContent');

    if (!container) {
      console.error('[FileVault Config] Container not found');
      return;
    }

    try {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-muted">Loading FileVault configuration...</p>
        </div>
      `;

      const response = await fetch('/lowcode/setup-config/api/filevault/configuration');
      const data = await response.json();

      if (data.success) {
        this.filevaultConfig = data.configuration;
        this.renderFileVaultConfiguration();
      } else {
        this.showError(data.message || 'Failed to load FileVault configuration');
      }
    } catch (error) {
      console.error('[FileVault Config] Load error:', error);
      this.showError(error.message);
    }
  }

  /**
   * Render the FileVault configuration UI
   */
  renderFileVaultConfiguration() {
    const container = document.getElementById('filevaultConfigContent');
    if (!container) return;

    const config = this.filevaultConfig;
    const isRunning = config.service.health.running;

    container.innerHTML = `
      <div class="filevault-config">
        <!-- Service Health -->
        <div class="card mb-3">
          <div class="card-header bg-primary text-white">
            <h6 class="mb-0">
              <i class="fas fa-heartbeat"></i> Service Health
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-${isRunning ? 'check-circle text-success' : 'times-circle text-danger'}" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? 'Running' : 'Stopped'}</div>
                  <small class="text-muted">Status</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-clock text-info" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.responseTime + 'ms' : 'N/A'}</div>
                  <small class="text-muted">Response Time</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-code-branch text-primary" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${isRunning ? config.service.health.version : 'N/A'}</div>
                  <small class="text-muted">Version</small>
                </div>
              </div>
              <div class="col-md-3">
                <div class="text-center p-3">
                  <div class="mb-2">
                    <i class="fas fa-hdd text-warning" style="font-size: 2rem;"></i>
                  </div>
                  <div class="fw-bold">${this.formatBytes(config.service.health.storageUsed || 0)}</div>
                  <small class="text-muted">Storage Used</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <button class="btn btn-sm btn-outline-primary" onclick="filevaultManager.testConnection()">
                <i class="fas fa-plug"></i> Test Connection
              </button>
              <button class="btn btn-sm btn-outline-secondary ms-2" onclick="filevaultManager.loadFileVaultConfiguration()">
                <i class="fas fa-sync-alt"></i> Refresh
              </button>
            </div>
          </div>
        </div>

        <!-- Service Connection -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-link"></i> Service Connection
            </h6>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label">Service URL</label>
              <input type="text" class="form-control" id="filevaultUrl"
                     value="${config.service.url}" placeholder="http://localhost:3010">
              <small class="text-muted">Base URL for FileVault service</small>
            </div>
            <div class="mb-3">
              <label class="form-label">API Key</label>
              <input type="password" class="form-control" id="filevaultApiKey"
                     value="${config.service.apiKey || ''}" placeholder="Enter API key">
              <small class="text-muted">Authentication key for FileVault API</small>
            </div>
          </div>
        </div>

        <!-- Storage Configuration -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-database"></i> Storage Configuration
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Storage Backend</label>
                <select class="form-select" id="filevaultStorageBackend">
                  <option value="s3" ${config.storage.backend === 's3' ? 'selected' : ''}>Amazon S3</option>
                  <option value="filesystem" ${config.storage.backend === 'filesystem' ? 'selected' : ''}>Local Filesystem</option>
                  <option value="azure" ${config.storage.backend === 'azure' ? 'selected' : ''}>Azure Blob Storage</option>
                  <option value="gcs" ${config.storage.backend === 'gcs' ? 'selected' : ''}>Google Cloud Storage</option>
                </select>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Cloud Provider</label>
                <select class="form-select" id="filevaultStorageProvider">
                  <option value="aws" ${config.storage.provider === 'aws' ? 'selected' : ''}>AWS</option>
                  <option value="azure" ${config.storage.provider === 'azure' ? 'selected' : ''}>Azure</option>
                  <option value="gcp" ${config.storage.provider === 'gcp' ? 'selected' : ''}>Google Cloud</option>
                  <option value="digitalocean" ${config.storage.provider === 'digitalocean' ? 'selected' : ''}>DigitalOcean Spaces</option>
                </select>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">S3 Bucket / Container Name</label>
                <input type="text" class="form-control" id="filevaultBucket"
                       value="${config.storage.bucket}" placeholder="exprsn-files">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Region</label>
                <input type="text" class="form-control" id="filevaultRegion"
                       value="${config.storage.region}" placeholder="us-east-1">
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Local Storage Path (for filesystem backend)</label>
                <input type="text" class="form-control" id="filevaultPath"
                       value="${config.storage.path}" placeholder="./storage/files">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Encryption</label>
                <div class="form-check form-switch mt-2">
                  <input class="form-check-input" type="checkbox" id="filevaultEncryption"
                         ${config.storage.encryption ? 'checked' : ''}>
                  <label class="form-check-label" for="filevaultEncryption">
                    Enable at-rest encryption
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Features -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-magic"></i> File Features
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="filevaultVirusScan"
                         ${config.features.virusScanning ? 'checked' : ''}>
                  <label class="form-check-label" for="filevaultVirusScan">
                    <i class="fas fa-shield-virus text-danger"></i> Virus Scanning
                    <br><small class="text-muted">Scan uploaded files for malware</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="filevaultThumbnails"
                         ${config.features.thumbnailGeneration ? 'checked' : ''}>
                  <label class="form-check-label" for="filevaultThumbnails">
                    <i class="fas fa-image text-primary"></i> Thumbnail Generation
                    <br><small class="text-muted">Auto-generate image thumbnails</small>
                  </label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="filevaultCDN"
                         ${config.features.cdn ? 'checked' : ''}>
                  <label class="form-check-label" for="filevaultCDN">
                    <i class="fas fa-network-wired text-info"></i> CDN Integration
                    <br><small class="text-muted">Serve files via CDN for faster delivery</small>
                  </label>
                </div>
              </div>
              <div class="col-md-6">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" id="filevaultVersioning"
                         ${config.features.versioning ? 'checked' : ''}>
                  <label class="form-check-label" for="filevaultVersioning">
                    <i class="fas fa-code-branch text-success"></i> File Versioning
                    <br><small class="text-muted">Keep history of file changes</small>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Limits & Security -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-sliders-h"></i> File Limits & Security
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Max File Size</label>
                <input type="text" class="form-control" id="filevaultMaxFileSize"
                       value="${config.limits.maxFileSize}" placeholder="100MB">
                <small class="text-muted">Maximum upload size (e.g., 100MB, 1GB)</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Max Storage Per User</label>
                <input type="text" class="form-control" id="filevaultMaxStorageUser"
                       value="${config.limits.maxStoragePerUser}" placeholder="10GB">
                <small class="text-muted">Per-user storage quota</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Allowed File Types</label>
                <input type="text" class="form-control" id="filevaultAllowedTypes"
                       value="${Array.isArray(config.limits.allowedTypes) ? config.limits.allowedTypes.join(',') : config.limits.allowedTypes}"
                       placeholder="*">
                <small class="text-muted">Comma-separated (e.g., jpg,png,pdf or * for all)</small>
              </div>
            </div>
          </div>
        </div>

        <!-- File Statistics -->
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-chart-bar"></i> File Statistics
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-file text-primary" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${config.files.totalFiles || 0}</div>
                  <small class="text-muted">Total Files</small>
                </div>
              </div>
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-hdd text-info" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${this.formatBytes(config.files.totalSize || 0)}</div>
                  <small class="text-muted">Total Size</small>
                </div>
              </div>
              <div class="col-md-4 text-center">
                <div class="p-3">
                  <i class="fas fa-tags text-success" style="font-size: 2rem;"></i>
                  <div class="mt-2 fw-bold">${Object.keys(config.files.fileTypes || {}).length}</div>
                  <small class="text-muted">File Types</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="text-end">
          <button class="btn btn-primary" onclick="filevaultManager.saveConfiguration()">
            <i class="fas fa-save"></i> Save Configuration
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Save FileVault configuration
   */
  async saveConfiguration() {
    try {
      const config = {
        service: {
          url: document.getElementById('filevaultUrl').value,
          apiKey: document.getElementById('filevaultApiKey').value
        },
        storage: {
          backend: document.getElementById('filevaultStorageBackend').value,
          provider: document.getElementById('filevaultStorageProvider').value,
          bucket: document.getElementById('filevaultBucket').value,
          region: document.getElementById('filevaultRegion').value,
          path: document.getElementById('filevaultPath').value,
          encryption: document.getElementById('filevaultEncryption').checked
        },
        features: {
          virusScanning: document.getElementById('filevaultVirusScan').checked,
          thumbnailGeneration: document.getElementById('filevaultThumbnails').checked,
          cdn: document.getElementById('filevaultCDN').checked,
          versioning: document.getElementById('filevaultVersioning').checked
        },
        limits: {
          maxFileSize: document.getElementById('filevaultMaxFileSize').value,
          maxStoragePerUser: document.getElementById('filevaultMaxStorageUser').value,
          allowedTypes: document.getElementById('filevaultAllowedTypes').value
        }
      };

      const response = await fetch('/lowcode/setup-config/api/filevault/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ FileVault Configuration Saved\n\n' +
              (data.requiresRestart ? 'Server restart required for changes to take effect.' : 'Changes applied.'));
        await this.loadFileVaultConfiguration();
      } else {
        alert('❌ Error\n\n' + (data.message || 'Failed to save configuration'));
      }
    } catch (error) {
      console.error('[FileVault Config] Save error:', error);
      alert('❌ Error\n\n' + error.message);
    }
  }

  /**
   * Test FileVault connection
   */
  async testConnection() {
    try {
      const response = await fetch('/lowcode/setup-config/api/filevault/test-connection', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        alert(`✅ Connection Successful\n\nResponse Time: ${data.responseTime}ms\nVersion: ${data.version}`);
      } else {
        alert('❌ Connection Failed\n\n' + data.message);
      }
    } catch (error) {
      alert('❌ Connection Failed\n\n' + error.message);
    }
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('filevaultConfigContent');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i>
          <strong>Error:</strong> ${message}
        </div>
      `;
    }
  }
}

// Initialize global instance
window.filevaultManager = new FileVaultConfigManager();
