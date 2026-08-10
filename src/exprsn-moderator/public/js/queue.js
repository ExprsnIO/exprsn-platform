/**
 * Moderation Queue Client-Side JavaScript
 * Handles queue management, filtering, review modal, and moderation actions
 */

// Socket.IO connection
const socket = io('/moderation', {
  auth: {
    token: localStorage.getItem('ca_token') || ''
  }
});

// Current state
let currentFilter = 'all';
let queueItems = [];
let currentItem = null;
let reviewModal = null;

/**
 * Initialize queue on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  initializeModal();
  loadQueue();
  initializeThemeToggle();
  setupSocketListeners();
});

/**
 * Initialize Bootstrap modal
 */
function initializeModal() {
  const modalElement = document.getElementById('reviewModal');
  reviewModal = new bootstrap.Modal(modalElement);

  // Clean up on modal close
  modalElement.addEventListener('hidden.bs.modal', () => {
    currentItem = null;
  });
}

/**
 * Load queue items
 */
async function loadQueue() {
  try {
    const response = await fetch('/api/queue');
    queueItems = await response.json();

    filterQueue(currentFilter);
    updateQueueCounts();

  } catch (error) {
    console.error('Failed to load queue:', error);
    showError('Failed to load review queue');
  }
}

/**
 * Filter queue by priority
 */
function filterQueue(filter) {
  currentFilter = filter;

  // Update active button
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  // Filter items
  let filteredItems = queueItems;
  if (filter !== 'all') {
    filteredItems = queueItems.filter(item => item.priority === filter);
  }

  // Render queue
  renderQueue(filteredItems);
}

/**
 * Render queue items
 */
function renderQueue(items) {
  const container = document.getElementById('queueContainer');

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-inbox fs-1 text-muted"></i>
        <p class="mt-3 text-muted">No items in queue</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="card mb-3 review-item priority-${item.priority}" data-item-id="${item.id}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h5 class="card-title mb-1">
              <span class="badge ${getPriorityBadgeClass(item.priority)}">${item.priority.toUpperCase()}</span>
              ${escapeHtml(item.contentType)} - ${escapeHtml(item.reportType || 'Review')}
            </h5>
            <p class="text-muted mb-0">
              <small>
                <i class="bi bi-person"></i> ${escapeHtml(item.authorName || 'Unknown')} |
                <i class="bi bi-clock"></i> ${formatTimeAgo(item.createdAt)} |
                <i class="bi bi-flag"></i> ${item.reportCount || 0} report(s)
              </small>
            </p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="reviewItem('${item.id}')">
            <i class="bi bi-eye"></i> Review
          </button>
        </div>

        <div class="content-preview">
          <p class="mb-0">${escapeHtml(item.content || 'No content available')}</p>
        </div>

        ${item.aiScore ? `
          <div class="mt-3">
            <small class="text-muted">
              AI Confidence: <strong>${Math.round(item.aiScore * 100)}%</strong>
              ${item.aiRecommendation ? `| Recommendation: <span class="badge ${getActionBadgeClass(item.aiRecommendation)}">${item.aiRecommendation}</span>` : ''}
            </small>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * Update queue counts
 */
function updateQueueCounts() {
  const counts = {
    all: queueItems.length,
    high: queueItems.filter(i => i.priority === 'high').length,
    medium: queueItems.filter(i => i.priority === 'medium').length,
    low: queueItems.filter(i => i.priority === 'low').length
  };

  document.getElementById('countAll').textContent = counts.all;
  document.getElementById('countHigh').textContent = counts.high;
  document.getElementById('countMedium').textContent = counts.medium;
  document.getElementById('countLow').textContent = counts.low;
  document.getElementById('queueCount').textContent = counts.all;
}

/**
 * Review item in modal
 */
async function reviewItem(itemId) {
  try {
    const response = await fetch(`/api/queue/${itemId}`);
    currentItem = await response.json();

    // Populate modal content
    document.getElementById('contentDisplay').innerHTML = `
      <div class="mb-3">
        <strong>Type:</strong> ${escapeHtml(currentItem.contentType)}<br>
        <strong>Author:</strong> ${escapeHtml(currentItem.authorName || 'Unknown')}<br>
        <strong>Posted:</strong> ${new Date(currentItem.createdAt).toLocaleString()}
      </div>
      <div class="border rounded p-3">
        ${escapeHtml(currentItem.content || 'No content available')}
      </div>
      ${currentItem.attachments && currentItem.attachments.length > 0 ? `
        <div class="mt-3">
          <strong>Attachments:</strong>
          <div class="d-flex gap-2 mt-2">
            ${currentItem.attachments.map(att => `
              <img src="${att.url}" alt="Attachment" class="img-thumbnail" style="max-width: 150px; max-height: 150px;">
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Populate details
    document.getElementById('contentDetails').innerHTML = `
      <dl class="row mb-0">
        <dt class="col-sm-5">Priority:</dt>
        <dd class="col-sm-7"><span class="badge ${getPriorityBadgeClass(currentItem.priority)}">${currentItem.priority.toUpperCase()}</span></dd>

        <dt class="col-sm-5">Reports:</dt>
        <dd class="col-sm-7">${currentItem.reportCount || 0}</dd>

        <dt class="col-sm-5">Report Type:</dt>
        <dd class="col-sm-7">${escapeHtml(currentItem.reportType || 'N/A')}</dd>

        <dt class="col-sm-5">Author ID:</dt>
        <dd class="col-sm-7"><code>${currentItem.authorId}</code></dd>

        <dt class="col-sm-5">Content ID:</dt>
        <dd class="col-sm-7"><code>${currentItem.contentId}</code></dd>
      </dl>
    `;

    // Populate history
    if (currentItem.history && currentItem.history.length > 0) {
      document.getElementById('contentHistory').innerHTML = currentItem.history.map(h => `
        <div class="mb-2">
          <span class="badge ${getActionBadgeClass(h.action)}">${h.action}</span>
          <small class="text-muted d-block">${formatTimeAgo(h.createdAt)} by ${escapeHtml(h.moderatorName)}</small>
        </div>
      `).join('');
    } else {
      document.getElementById('contentHistory').innerHTML = '<p class="text-muted mb-0">No previous actions</p>';
    }

    // Clear AI analysis
    document.getElementById('aiAnalysis').innerHTML = `
      <button class="btn btn-sm btn-primary" onclick="runAIAnalysis()">
        <i class="bi bi-cpu"></i> Run AI Analysis
      </button>
    `;

    // Populate suggested actions
    const suggestions = generateSuggestions(currentItem);
    document.getElementById('suggestedActions').innerHTML = suggestions.map(s => `
      <div class="alert alert-${s.type} py-2 mb-2">
        <small><strong>${s.title}:</strong> ${s.description}</small>
      </div>
    `).join('');

    // Show modal
    reviewModal.show();

  } catch (error) {
    console.error('Failed to load item:', error);
    showError('Failed to load item details');
  }
}

/**
 * Run AI analysis on current item
 */
async function runAIAnalysis() {
  if (!currentItem) return;

  const analysisContainer = document.getElementById('aiAnalysis');
  analysisContainer.innerHTML = `
    <div class="text-center">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <span class="ms-2">Analyzing content...</span>
    </div>
  `;

  try {
    const response = await fetch(`/api/moderate/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentId: currentItem.contentId,
        contentType: currentItem.contentType,
        content: currentItem.content
      })
    });

    const analysis = await response.json();

    analysisContainer.innerHTML = `
      <div class="alert alert-${analysis.flagged ? 'danger' : 'success'} mb-2">
        <strong>Result:</strong> ${analysis.flagged ? 'Policy Violation Detected' : 'No Violations Found'}
      </div>
      <div class="mb-2">
        <strong>Confidence:</strong> ${Math.round(analysis.confidence * 100)}%
      </div>
      ${analysis.categories && analysis.categories.length > 0 ? `
        <div class="mb-2">
          <strong>Categories:</strong><br>
          ${analysis.categories.map(c => `<span class="badge bg-warning me-1">${c}</span>`).join('')}
        </div>
      ` : ''}
      <div>
        <strong>Reasoning:</strong><br>
        <small>${escapeHtml(analysis.reasoning || 'No reasoning provided')}</small>
      </div>
      ${analysis.recommendation ? `
        <div class="mt-2">
          <strong>Recommendation:</strong>
          <span class="badge ${getActionBadgeClass(analysis.recommendation)}">${analysis.recommendation}</span>
        </div>
      ` : ''}
    `;

  } catch (error) {
    console.error('Failed to run AI analysis:', error);
    analysisContainer.innerHTML = `
      <div class="alert alert-danger mb-0">
        Failed to run AI analysis. Please try again.
      </div>
    `;
  }
}

/**
 * Approve content
 */
async function approveContent() {
  if (!currentItem) return;

  if (!confirm('Are you sure you want to approve this content?')) return;

  try {
    await fetch(`/api/moderate/${currentItem.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Approved by moderator' })
    });

    showSuccess('Content approved');
    reviewModal.hide();
    loadQueue();

  } catch (error) {
    console.error('Failed to approve:', error);
    showError('Failed to approve content');
  }
}

/**
 * Warn user
 */
async function warnUser() {
  if (!currentItem) return;

  const reason = prompt('Enter warning reason:');
  if (!reason) return;

  try {
    await fetch(`/api/moderate/${currentItem.id}/warn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    showSuccess('Warning issued');
    reviewModal.hide();
    loadQueue();

  } catch (error) {
    console.error('Failed to warn:', error);
    showError('Failed to issue warning');
  }
}

/**
 * Remove content
 */
async function removeContent() {
  if (!currentItem) return;

  const reason = prompt('Enter removal reason:');
  if (!reason) return;

  try {
    await fetch(`/api/moderate/${currentItem.id}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    showSuccess('Content removed');
    reviewModal.hide();
    loadQueue();

  } catch (error) {
    console.error('Failed to remove:', error);
    showError('Failed to remove content');
  }
}

/**
 * Ban user
 */
async function banUser() {
  if (!currentItem) return;

  const reason = prompt('Enter ban reason:');
  if (!reason) return;

  const duration = prompt('Ban duration in days (leave empty for permanent):');

  try {
    await fetch(`/api/moderate/${currentItem.id}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        durationDays: duration ? parseInt(duration) : null
      })
    });

    showSuccess('User banned');
    reviewModal.hide();
    loadQueue();

  } catch (error) {
    console.error('Failed to ban user:', error);
    showError('Failed to ban user');
  }
}

/**
 * Skip item
 */
function skipItem() {
  reviewModal.hide();
}

/**
 * Refresh queue
 */
function refreshQueue() {
  loadQueue();
}

/**
 * Setup Socket.IO listeners
 */
function setupSocketListeners() {
  // Connection status
  socket.on('connect', () => {
    console.log('Connected to moderation server');
    document.querySelector('.real-time-indicator i').classList.add('text-success');
    document.querySelector('.real-time-indicator i').classList.remove('text-danger');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from moderation server');
    document.querySelector('.real-time-indicator i').classList.add('text-danger');
    document.querySelector('.real-time-indicator i').classList.remove('text-success');
  });

  // Queue updates
  socket.on('queue:new', (item) => {
    queueItems.unshift(item);
    filterQueue(currentFilter);
    updateQueueCounts();
    showNotification('New item added to queue');
  });

  socket.on('queue:update', (updatedItem) => {
    const index = queueItems.findIndex(i => i.id === updatedItem.id);
    if (index !== -1) {
      queueItems[index] = updatedItem;
      filterQueue(currentFilter);
    }
  });

  socket.on('queue:remove', (itemId) => {
    queueItems = queueItems.filter(i => i.id !== itemId);
    filterQueue(currentFilter);
    updateQueueCounts();
  });
}

/**
 * Initialize theme toggle
 */
function initializeThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const html = document.documentElement;

  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  html.setAttribute('data-bs-theme', savedTheme);
  updateThemeIcon(savedTheme, themeIcon);

  // Toggle theme
  themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    html.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme, themeIcon);
  });
}

/**
 * Update theme icon
 */
function updateThemeIcon(theme, icon) {
  if (theme === 'dark') {
    icon.classList.remove('bi-sun-fill');
    icon.classList.add('bi-moon-fill');
  } else {
    icon.classList.remove('bi-moon-fill');
    icon.classList.add('bi-sun-fill');
  }
}

/**
 * Generate suggestions based on item
 */
function generateSuggestions(item) {
  const suggestions = [];

  if (item.reportCount >= 10) {
    suggestions.push({
      type: 'danger',
      title: 'High Report Count',
      description: 'This content has been reported multiple times. Consider immediate action.'
    });
  }

  if (item.aiScore && item.aiScore > 0.8) {
    suggestions.push({
      type: 'warning',
      title: 'High AI Confidence',
      description: `AI is ${Math.round(item.aiScore * 100)}% confident this violates policies.`
    });
  }

  if (item.history && item.history.length > 0) {
    const recentWarnings = item.history.filter(h => h.action === 'warned').length;
    if (recentWarnings >= 2) {
      suggestions.push({
        type: 'danger',
        title: 'Repeat Offender',
        description: 'User has received multiple warnings. Consider escalation.'
      });
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'info',
      title: 'No Issues Detected',
      description: 'Review content and reports before taking action.'
    });
  }

  return suggestions;
}

/**
 * Utility functions
 */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getPriorityBadgeClass(priority) {
  const classes = {
    high: 'bg-danger',
    medium: 'bg-warning',
    low: 'bg-info'
  };
  return classes[priority] || 'bg-secondary';
}

function getActionBadgeClass(action) {
  const classes = {
    approve: 'bg-success',
    approved: 'bg-success',
    remove: 'bg-danger',
    removed: 'bg-danger',
    warn: 'bg-warning',
    warned: 'bg-warning',
    ban: 'bg-dark',
    banned: 'bg-dark'
  };
  return classes[action.toLowerCase()] || 'bg-secondary';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccess(message) {
  showToast(message, 'success');
}

function showError(message) {
  showToast(message, 'danger');
}

function showNotification(message) {
  showToast(message, 'info');
}

function showToast(message, type = 'info') {
  // Simple alert for now - can be enhanced with Bootstrap toast component
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.zIndex = '9999';
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}
