/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn FileVault Dashboard - Main JavaScript
 * ═══════════════════════════════════════════════════════════════════════
 */

// Global state
const Dashboard = {
  currentPath: '/',
  currentView: 'grid',
  currentSort: 'name',
  selectMode: false,
  selectedFiles: new Set(),
  currentFileId: null,
  token: null
};

// ═══════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  console.log('FileVault Dashboard initializing...');

  // Initialize authentication
  initAuth();

  // Load storage information
  loadStorageInfo();

  // Setup event listeners
  setupEventListeners();

  // Load initial file list
  FileBrowser.loadFiles();

  console.log('FileVault Dashboard initialized successfully');
});

// ═══════════════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════════════

function initAuth() {
  // Get token from localStorage or prompt user
  Dashboard.token = localStorage.getItem('filevault_token');

  if (!Dashboard.token) {
    // For demo purposes, we'll use a placeholder
    // In production, this should redirect to login
    console.warn('No authentication token found');
    // showToast('Please authenticate to use FileVault', 'warning');
  }
}

function getAuthHeaders() {
  return {
    'Authorization': `Bearer ${Dashboard.token}`,
    'Content-Type': 'application/json'
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════════════════

function setupEventListeners() {
  // View toggle
  document.getElementById('btnGridView')?.addEventListener('click', () => switchView('grid'));
  document.getElementById('btnListView')?.addEventListener('click', () => switchView('list'));

  // Refresh button
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    FileBrowser.loadFiles();
    showToast('Files refreshed', 'success');
  });

  // Select mode toggle
  document.getElementById('btnSelectMode')?.addEventListener('click', toggleSelectMode);

  // Upload buttons
  document.getElementById('btnUploadFile')?.addEventListener('click', () => showUploadModal());
  document.getElementById('btnEmptyStateUpload')?.addEventListener('click', () => showUploadModal());

  // New folder button
  document.getElementById('btnNewFolder')?.addEventListener('click', createNewFolder);

  // Search
  document.getElementById('searchForm')?.addEventListener('submit', handleSearch);

  // Navigation links
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = e.currentTarget.dataset.view;
      handleNavigation(view);
    });
  });

  // File type filters
  document.querySelectorAll('[data-filter]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = e.currentTarget.dataset.filter;
      FileBrowser.applyFilter(filter);
    });
  });

  // Sort options
  document.querySelectorAll('[data-sort]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sort = e.currentTarget.dataset.sort;
      Dashboard.currentSort = sort;
      FileBrowser.loadFiles();
    });
  });

  // Bulk actions
  document.getElementById('btnBulkDownload')?.addEventListener('click', bulkDownload);
  document.getElementById('btnBulkShare')?.addEventListener('click', bulkShare);
  document.getElementById('btnBulkDelete')?.addEventListener('click', bulkDelete);
  document.getElementById('btnClearSelection')?.addEventListener('click', clearSelection);

  // Context menu (right-click)
  document.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('click', hideContextMenu);

  // User menu actions
  document.querySelectorAll('[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const action = e.currentTarget.dataset.action;
      handleUserAction(action);
    });
  });

  // WebDAV modal
  document.getElementById('btnGenerateWebDAVToken')?.addEventListener('click', generateWebDAVToken);
  document.getElementById('btnCopyWebDAVUrl')?.addEventListener('click', () => {
    copyToClipboard(document.getElementById('webdavUrl').value);
    showToast('WebDAV URL copied to clipboard', 'success');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

// ═══════════════════════════════════════════════════════════════════════
// View Management
// ═══════════════════════════════════════════════════════════════════════

function switchView(view) {
  Dashboard.currentView = view;

  const gridView = document.getElementById('gridView');
  const listView = document.getElementById('listView');
  const btnGrid = document.getElementById('btnGridView');
  const btnList = document.getElementById('btnListView');

  if (view === 'grid') {
    gridView.classList.remove('d-none');
    listView.classList.add('d-none');
    btnGrid.classList.add('active');
    btnList.classList.remove('active');
  } else {
    gridView.classList.add('d-none');
    listView.classList.remove('d-none');
    btnGrid.classList.remove('active');
    btnList.classList.add('active');
  }

  // Save preference
  localStorage.setItem('filevault_view', view);
}

function toggleSelectMode() {
  Dashboard.selectMode = !Dashboard.selectMode;
  document.body.classList.toggle('select-mode', Dashboard.selectMode);

  if (!Dashboard.selectMode) {
    clearSelection();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Storage Information
// ═══════════════════════════════════════════════════════════════════════

async function loadStorageInfo() {
  try {
    const response = await fetch('/api/storage/quota', {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load storage info');
    }

    const data = await response.json();

    if (data.success) {
      updateStorageDisplay(data.quota);
    }
  } catch (error) {
    console.error('Error loading storage info:', error);
    // Use default values
    updateStorageDisplay({
      used: 0,
      limit: 1073741824 // 1 GB
    });
  }
}

function updateStorageDisplay(quota) {
  const used = formatFileSize(quota.used || 0);
  const total = formatFileSize(quota.limit || 1073741824);
  const percentage = quota.limit ? (quota.used / quota.limit * 100).toFixed(1) : 0;

  // Update header
  document.getElementById('storageUsed').textContent = used;
  document.getElementById('storageQuota').textContent = total;

  // Update sidebar
  document.getElementById('sidebarStorageUsed').textContent = used;
  document.getElementById('sidebarStorageQuota').textContent = total;

  // Update progress bar
  const progressBar = document.getElementById('storageProgressBar');
  progressBar.style.width = `${percentage}%`;
  progressBar.setAttribute('aria-valuenow', percentage);

  // Change color based on usage
  progressBar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
  if (percentage < 70) {
    progressBar.classList.add('bg-success');
  } else if (percentage < 90) {
    progressBar.classList.add('bg-warning');
  } else {
    progressBar.classList.add('bg-danger');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════════

function handleNavigation(view) {
  // Update active nav link
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.view === view) {
      link.classList.add('active');
    }
  });

  // Load files based on view
  switch (view) {
    case 'all-files':
      FileBrowser.loadFiles();
      break;
    case 'recent':
      FileBrowser.loadRecentFiles();
      break;
    case 'shared-with-me':
      FileBrowser.loadSharedFiles();
      break;
    case 'favorites':
      FileBrowser.loadFavorites();
      break;
    case 'trash':
      FileBrowser.loadTrash();
      break;
  }
}

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');
  const parts = path.split('/').filter(p => p);

  let html = `
    <li class="breadcrumb-item">
      <a href="#" data-path="/">
        <i class="bi bi-house-fill me-1" aria-hidden="true"></i>
        Home
      </a>
    </li>
  `;

  let currentPath = '';
  parts.forEach((part, index) => {
    currentPath += '/' + part;
    const isLast = index === parts.length - 1;

    if (isLast) {
      html += `
        <li class="breadcrumb-item active" aria-current="page">${escapeHtml(part)}</li>
      `;
    } else {
      html += `
        <li class="breadcrumb-item">
          <a href="#" data-path="${currentPath}">${escapeHtml(part)}</a>
        </li>
      `;
    }
  });

  breadcrumb.innerHTML = html;

  // Add click handlers to breadcrumb links
  breadcrumb.querySelectorAll('a[data-path]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      Dashboard.currentPath = e.currentTarget.dataset.path;
      FileBrowser.loadFiles();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════

function handleSearch(e) {
  e.preventDefault();
  const query = document.getElementById('searchInput').value.trim();

  if (!query) {
    FileBrowser.loadFiles();
    return;
  }

  FileBrowser.searchFiles(query);
}

// ═══════════════════════════════════════════════════════════════════════
// Selection Management
// ═══════════════════════════════════════════════════════════════════════

function toggleFileSelection(fileId) {
  if (Dashboard.selectedFiles.has(fileId)) {
    Dashboard.selectedFiles.delete(fileId);
  } else {
    Dashboard.selectedFiles.add(fileId);
  }

  updateSelectionUI();
}

function clearSelection() {
  Dashboard.selectedFiles.clear();
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = Dashboard.selectedFiles.size;
  const alert = document.getElementById('selectionAlert');
  const countEl = document.getElementById('selectedCount');

  if (count > 0) {
    alert.classList.remove('d-none');
    alert.classList.add('d-flex');
    countEl.textContent = count;
  } else {
    alert.classList.add('d-none');
    alert.classList.remove('d-flex');
  }

  // Update file item selections
  document.querySelectorAll('.file-item').forEach(item => {
    const fileId = item.dataset.fileId;
    if (Dashboard.selectedFiles.has(fileId)) {
      item.classList.add('selected');
      const checkbox = item.querySelector('.file-select-checkbox input');
      if (checkbox) checkbox.checked = true;
    } else {
      item.classList.remove('selected');
      const checkbox = item.querySelector('.file-select-checkbox input');
      if (checkbox) checkbox.checked = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Bulk Actions
// ═══════════════════════════════════════════════════════════════════════

async function bulkDownload() {
  if (Dashboard.selectedFiles.size === 0) return;

  showToast('Preparing download...', 'info');

  // Download each file
  for (const fileId of Dashboard.selectedFiles) {
    await downloadFile(fileId);
  }

  showToast(`Downloaded ${Dashboard.selectedFiles.size} file(s)`, 'success');
}

async function bulkShare() {
  if (Dashboard.selectedFiles.size === 0) return;

  // For multiple files, we could create a shared folder or individual links
  showToast('Bulk sharing feature coming soon', 'info');
}

async function bulkDelete() {
  if (Dashboard.selectedFiles.size === 0) return;

  if (!confirm(`Are you sure you want to delete ${Dashboard.selectedFiles.size} file(s)?`)) {
    return;
  }

  showLoading(true);

  try {
    for (const fileId of Dashboard.selectedFiles) {
      await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
    }

    showToast(`Deleted ${Dashboard.selectedFiles.size} file(s)`, 'success');
    clearSelection();
    FileBrowser.loadFiles();
  } catch (error) {
    console.error('Error deleting files:', error);
    showToast('Failed to delete some files', 'error');
  } finally {
    showLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Context Menu
// ═══════════════════════════════════════════════════════════════════════

function handleContextMenu(e) {
  const fileItem = e.target.closest('.file-item');

  if (!fileItem) {
    hideContextMenu();
    return;
  }

  e.preventDefault();

  const fileId = fileItem.dataset.fileId;
  Dashboard.currentFileId = fileId;

  const menu = document.getElementById('contextMenu');
  menu.style.display = 'block';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;

  // Add event listeners to menu items
  menu.querySelectorAll('[data-action]').forEach(item => {
    item.onclick = (e) => {
      e.preventDefault();
      const action = e.currentTarget.dataset.action;
      handleFileAction(action, fileId);
      hideContextMenu();
    };
  });
}

function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  menu.style.display = 'none';
}

async function handleFileAction(action, fileId) {
  switch (action) {
    case 'preview':
      FilePreview.showPreview(fileId);
      break;
    case 'download':
      downloadFile(fileId);
      break;
    case 'edit':
      FileEditor.openEditor(fileId);
      break;
    case 'share':
      ShareManager.showShareModal(fileId);
      break;
    case 'versions':
      showVersionHistory(fileId);
      break;
    case 'info':
      showFileInfo(fileId);
      break;
    case 'rename':
      renameFile(fileId);
      break;
    case 'move':
      moveFile(fileId);
      break;
    case 'delete':
      deleteFile(fileId);
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// User Actions
// ═══════════════════════════════════════════════════════════════════════

function handleUserAction(action) {
  switch (action) {
    case 'settings':
      showSettings();
      break;
    case 'storage':
      showStorageInfo();
      break;
    case 'logout':
      logout();
      break;
  }
}

function showSettings() {
  showToast('Settings panel coming soon', 'info');
}

function showStorageInfo() {
  showToast('Detailed storage information coming soon', 'info');
}

function logout() {
  localStorage.removeItem('filevault_token');
  window.location.href = '/';
}

// ═══════════════════════════════════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════════════

function handleKeyboardShortcuts(e) {
  // Ctrl/Cmd + U: Upload
  if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
    e.preventDefault();
    showUploadModal();
  }

  // Ctrl/Cmd + A: Select all
  if ((e.ctrlKey || e.metaKey) && e.key === 'a' && Dashboard.selectMode) {
    e.preventDefault();
    selectAllFiles();
  }

  // Escape: Clear selection or close modals
  if (e.key === 'Escape') {
    clearSelection();
    hideContextMenu();
  }

  // Delete: Delete selected files
  if (e.key === 'Delete' && Dashboard.selectedFiles.size > 0) {
    bulkDelete();
  }
}

function selectAllFiles() {
  document.querySelectorAll('.file-item').forEach(item => {
    Dashboard.selectedFiles.add(item.dataset.fileId);
  });
  updateSelectionUI();
}

// ═══════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  // Format as date
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

function showLoading(show = true) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.remove('d-none');
  } else {
    overlay.classList.add('d-none');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const id = `toast-${Date.now()}`;

  const typeClasses = {
    success: 'toast-success',
    error: 'toast-error',
    warning: 'toast-warning',
    info: 'toast-info'
  };

  const icons = {
    success: 'check-circle-fill',
    error: 'x-circle-fill',
    warning: 'exclamation-triangle-fill',
    info: 'info-circle-fill'
  };

  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `toast ${typeClasses[type] || typeClasses.info}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');

  toast.innerHTML = `
    <div class="toast-body d-flex align-items-center">
      <i class="bi bi-${icons[type] || icons.info} me-2" aria-hidden="true"></i>
      <span class="flex-grow-1">${escapeHtml(message)}</span>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toast);

  const bsToast = new bootstrap.Toast(toast, {
    autohide: true,
    delay: 3000
  });

  bsToast.show();

  // Remove from DOM after hidden
  toast.addEventListener('hidden.bs.toast', () => {
    toast.remove();
  });
}

function getFileIcon(mimetype, isDirectory = false) {
  if (isDirectory) {
    return 'bi-folder-fill file-folder';
  }

  if (mimetype.startsWith('image/')) {
    return 'bi-file-image file-image';
  }

  if (mimetype.startsWith('video/')) {
    return 'bi-camera-video-fill file-video';
  }

  if (mimetype.startsWith('audio/')) {
    return 'bi-file-music file-audio';
  }

  if (mimetype.includes('pdf')) {
    return 'bi-file-pdf file-document';
  }

  if (mimetype.includes('word') || mimetype.includes('document')) {
    return 'bi-file-word file-document';
  }

  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
    return 'bi-file-excel file-document';
  }

  if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) {
    return 'bi-file-ppt file-document';
  }

  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('tar') || mimetype.includes('7z')) {
    return 'bi-file-zip file-archive';
  }

  if (mimetype.includes('javascript') || mimetype.includes('json') || mimetype.includes('xml') || mimetype.includes('html')) {
    return 'bi-file-code file-code';
  }

  if (mimetype.startsWith('text/')) {
    return 'bi-file-text file-document';
  }

  return 'bi-file-earmark file-generic';
}

async function downloadFile(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/download`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Get filename from Content-Disposition header
    const disposition = response.headers.get('Content-Disposition');
    const filenameMatch = disposition && disposition.match(/filename="(.+)"/);
    a.download = filenameMatch ? filenameMatch[1] : 'download';

    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Download started', 'success');
  } catch (error) {
    console.error('Error downloading file:', error);
    showToast('Failed to download file', 'error');
  }
}

async function deleteFile(fileId) {
  if (!confirm('Are you sure you want to delete this file?')) {
    return;
  }

  try {
    const response = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Delete failed');
    }

    showToast('File deleted successfully', 'success');
    FileBrowser.loadFiles();
  } catch (error) {
    console.error('Error deleting file:', error);
    showToast('Failed to delete file', 'error');
  }
}

async function renameFile(fileId) {
  const newName = prompt('Enter new file name:');
  if (!newName) return;

  try {
    const response = await fetch(`/api/files/${fileId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: newName })
    });

    if (!response.ok) {
      throw new Error('Rename failed');
    }

    showToast('File renamed successfully', 'success');
    FileBrowser.loadFiles();
  } catch (error) {
    console.error('Error renaming file:', error);
    showToast('Failed to rename file', 'error');
  }
}

async function moveFile(fileId) {
  showToast('Move file feature coming soon', 'info');
}

async function showVersionHistory(fileId) {
  showToast('Version history feature coming soon', 'info');
}

async function showFileInfo(fileId) {
  showToast('File info feature coming soon', 'info');
}

async function createNewFolder() {
  const name = prompt('Enter folder name:');
  if (!name) return;

  try {
    const response = await fetch('/api/directories', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name,
        parentId: Dashboard.currentPath === '/' ? null : Dashboard.currentPath
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create folder');
    }

    showToast('Folder created successfully', 'success');
    FileBrowser.loadFiles();
  } catch (error) {
    console.error('Error creating folder:', error);
    showToast('Failed to create folder', 'error');
  }
}

function showUploadModal() {
  const modal = new bootstrap.Modal(document.getElementById('uploadModal'));
  modal.show();

  // Initialize upload handlers
  setupUploadHandlers();
}

function setupUploadHandlers() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnStartUpload = document.getElementById('btnStartUpload');

  // File input change
  fileInput.addEventListener('change', handleFileSelect);

  // Click drop zone to select files
  dropZone.addEventListener('click', () => fileInput.click());

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFileSelect({ target: { files } });
  });

  // Start upload button
  btnStartUpload.addEventListener('click', startUpload);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  const queue = document.getElementById('uploadQueue');

  queue.innerHTML = '';

  files.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.dataset.index = index;
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="file-name">
          <i class="bi bi-file-earmark me-2"></i>
          ${escapeHtml(file.name)}
        </div>
        <small class="text-muted">${formatFileSize(file.size)}</small>
      </div>
      <div class="progress d-none">
        <div class="progress-bar" role="progressbar" style="width: 0%"></div>
      </div>
      <small class="status text-muted">Ready to upload</small>
    `;
    queue.appendChild(item);
  });

  document.getElementById('btnStartUpload').disabled = files.length === 0;
}

async function startUpload() {
  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);

  if (files.length === 0) return;

  document.getElementById('uploadProgress').classList.remove('d-none');
  document.getElementById('btnStartUpload').disabled = true;

  let uploaded = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const item = document.querySelector(`.upload-item[data-index="${i}"]`);

    try {
      await uploadFile(file, item);
      uploaded++;
    } catch (error) {
      console.error('Upload failed:', error);
      item.classList.add('error');
      item.querySelector('.status').textContent = 'Upload failed';
    }

    // Update overall progress
    const overallProgress = ((i + 1) / files.length) * 100;
    document.getElementById('uploadProgressBar').style.width = `${overallProgress}%`;
    document.getElementById('uploadStatus').textContent = `Uploaded ${uploaded} of ${files.length} files`;
  }

  showToast(`Successfully uploaded ${uploaded} file(s)`, 'success');

  // Refresh file list
  FileBrowser.loadFiles();

  // Close modal after a delay
  setTimeout(() => {
    bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
    resetUploadModal();
  }, 2000);
}

async function uploadFile(file, itemElement) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', Dashboard.currentPath);

  // Show progress
  itemElement.querySelector('.progress').classList.remove('d-none');
  itemElement.querySelector('.status').textContent = 'Uploading...';

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        itemElement.querySelector('.progress-bar').style.width = `${progress}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        itemElement.classList.add('success');
        itemElement.querySelector('.status').textContent = 'Upload complete';
        itemElement.querySelector('.progress-bar').classList.add('bg-success');
        resolve();
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));

    xhr.open('POST', '/api/files/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${Dashboard.token}`);
    xhr.send(formData);
  });
}

function resetUploadModal() {
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadQueue').innerHTML = '';
  document.getElementById('uploadProgress').classList.add('d-none');
  document.getElementById('uploadProgressBar').style.width = '0%';
  document.getElementById('btnStartUpload').disabled = true;
}

async function generateWebDAVToken() {
  showToast('WebDAV token generation coming soon', 'info');
}

// Set WebDAV URL
document.addEventListener('DOMContentLoaded', () => {
  const webdavUrl = `${window.location.protocol}//${window.location.host}/webdav`;
  const webdavUrlInput = document.getElementById('webdavUrl');
  if (webdavUrlInput) {
    webdavUrlInput.value = webdavUrl;
  }
});
