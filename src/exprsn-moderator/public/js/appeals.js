/**
 * Appeals Management JavaScript
 * Handles appeal review, approval/denial, and case history
 */

// Global state
let currentPage = 1;
let pageSize = 50;
let filters = {
    status: 'pending',
    sort: 'newest',
    search: ''
};
let currentAppeal = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupTheme();
    setupSidebar();
    setupSocket();
    await loadAppeals();
    await loadStats();
});

// Theme Management
function setupTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const html = document.documentElement;

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-bs-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-bs-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        themeIcon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    }
}

// Sidebar Management
function setupSidebar() {
    const sidebar = document.getElementById('sidebarMenu');
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.remove('show');
    }
}

// Socket.IO Connection
function setupSocket() {
    const token = localStorage.getItem('ca_token') || 'moderator-session';

    socket = io('/moderation', {
        auth: { token },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to moderation socket');
        showToast('Connected to real-time updates', 'success');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from moderation socket');
        showToast('Disconnected from real-time updates', 'warning');
    });

    socket.on('appeal:new', (appeal) => {
        console.log('New appeal submitted:', appeal);
        showToast('New appeal submitted', 'info');
        loadAppeals();
        loadStats();
    });

    socket.on('appeal:reviewed', (appeal) => {
        console.log('Appeal reviewed:', appeal);
        loadAppeals();
        loadStats();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
}

// Load Appeals
async function loadAppeals() {
    try {
        const params = new URLSearchParams({
            limit: pageSize,
            offset: (currentPage - 1) * pageSize,
            ...filters
        });

        // Remove empty filters
        for (const [key, value] of [...params.entries()]) {
            if (!value) params.delete(key);
        }

        const response = await fetch(`/api/appeals?${params}`);
        if (!response.ok) throw new Error('Failed to fetch appeals');

        const data = await response.json();
        renderAppeals(data.appeals || []);
        renderPagination(data.pagination || { total: 0 });
    } catch (error) {
        console.error('Error loading appeals:', error);
        showToast('Failed to load appeals', 'danger');
        document.getElementById('appealsTable').innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">Error loading appeals. Please try again.</td></tr>
        `;
    }
}

// Load Statistics
async function loadStats() {
    try {
        const response = await fetch('/api/appeals/stats/summary');
        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json();
        const stats = data.stats || {};

        document.getElementById('statTotal').textContent = stats.total || 0;
        document.getElementById('statPending').textContent = stats.pending || 0;
        document.getElementById('statApproved').textContent = stats.approved || 0;
        document.getElementById('statDenied').textContent = stats.denied || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
        // Try alternative method - load all appeals
        try {
            const response = await fetch('/api/appeals?limit=1000');
            const data = await response.json();
            const appeals = data.appeals || [];

            const stats = {
                total: appeals.length,
                pending: appeals.filter(a => a.status === 'pending').length,
                approved: appeals.filter(a => a.status === 'approved').length,
                denied: appeals.filter(a => a.status === 'denied').length
            };

            document.getElementById('statTotal').textContent = stats.total;
            document.getElementById('statPending').textContent = stats.pending;
            document.getElementById('statApproved').textContent = stats.approved;
            document.getElementById('statDenied').textContent = stats.denied;
        } catch (fallbackError) {
            console.error('Error loading stats (fallback):', fallbackError);
        }
    }
}

// Render Appeals Table
function renderAppeals(appeals) {
    const tbody = document.getElementById('appealsTable');

    if (appeals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No appeals found</td></tr>';
        return;
    }

    tbody.innerHTML = appeals.map(appeal => {
        const moderationItem = appeal.moderationItem || appeal.moderation_item || {};
        const action = moderationItem.action || 'Unknown';

        return `
            <tr>
                <td><code class="small">${appeal.id.substring(0, 12)}</code></td>
                <td><code class="small">${(appeal.user_id || appeal.userId || 'unknown').substring(0, 12)}</code></td>
                <td><span class="badge bg-warning">${action}</span></td>
                <td>${truncate(appeal.reason || 'No reason provided', 50)}</td>
                <td><span class="badge badge-${appeal.status}">${formatStatus(appeal.status)}</span></td>
                <td>${formatDate(appeal.created_at || appeal.createdAt)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewAppeal('${appeal.id}')">
                        <i class="bi bi-eye"></i> Review
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render Pagination
function renderPagination(pagination) {
    const paginationEl = document.getElementById('pagination');
    const totalPages = Math.ceil((pagination.total || 0) / pageSize);

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a>
        </li>
    `;

    // Page numbers
    for (let i = 1; i <= Math.min(totalPages, 10); i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }

    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a>
        </li>
    `;

    paginationEl.innerHTML = html;
}

// Change Page
function changePage(page) {
    if (page < 1) return;
    currentPage = page;
    loadAppeals();
}

// Apply Filters
function applyFilters() {
    filters.status = document.getElementById('filterStatus').value;
    filters.sort = document.getElementById('filterSort').value;
    filters.search = document.getElementById('searchInput').value;
    currentPage = 1;
    loadAppeals();
}

// View Appeal Details
async function viewAppeal(appealId) {
    try {
        const response = await fetch(`/api/appeals/${appealId}`);
        if (!response.ok) throw new Error('Failed to fetch appeal');

        const data = await response.json();
        currentAppeal = data.appeal;

        // Populate basic info
        document.getElementById('modalAppealId').textContent = currentAppeal.id.substring(0, 12);
        document.getElementById('modalUserId').textContent = (currentAppeal.user_id || currentAppeal.userId || 'unknown').substring(0, 12);
        document.getElementById('modalStatus').innerHTML = `<span class="badge badge-${currentAppeal.status}">${formatStatus(currentAppeal.status)}</span>`;
        document.getElementById('modalSubmittedAt').textContent = formatFullDate(currentAppeal.created_at || currentAppeal.createdAt);
        document.getElementById('modalReviewedAt').textContent = currentAppeal.reviewed_at || currentAppeal.reviewedAt ? formatFullDate(currentAppeal.reviewed_at || currentAppeal.reviewedAt) : 'Not yet reviewed';
        document.getElementById('modalReviewerId').textContent = (currentAppeal.reviewer_id || currentAppeal.reviewerId || 'N/A').substring(0, 12);

        // User's appeal reason
        document.getElementById('modalAppealReason').textContent = currentAppeal.reason || 'No reason provided';

        // Original moderation case
        const moderationItem = currentAppeal.moderationItem || currentAppeal.moderation_item || {};
        document.getElementById('modalCaseId').textContent = (moderationItem.id || 'N/A').substring(0, 12);
        document.getElementById('modalOriginalAction').textContent = moderationItem.action || 'Unknown';
        document.getElementById('modalContentType').textContent = moderationItem.content_type || moderationItem.contentType || 'Unknown';
        document.getElementById('modalOriginalReason').textContent = moderationItem.reason || 'No reason provided';
        document.getElementById('modalOriginalModerator').textContent = (moderationItem.moderator_id || moderationItem.moderatorId || 'System').substring(0, 12);
        document.getElementById('modalOriginalDate').textContent = formatFullDate(moderationItem.created_at || moderationItem.createdAt);
        document.getElementById('modalOriginalContent').textContent = moderationItem.content || 'Content not available';

        // Show/hide sections based on status
        const isPending = currentAppeal.status === 'pending';
        document.getElementById('decisionSection').style.display = isPending ? 'block' : 'none';
        document.getElementById('submitDecisionBtn').style.display = isPending ? 'inline-block' : 'none';
        document.getElementById('reviewHistorySection').style.display = !isPending ? 'block' : 'none';

        if (!isPending) {
            // Show review history
            document.getElementById('historyDecision').innerHTML = `<span class="badge badge-${currentAppeal.status}">${formatStatus(currentAppeal.status)}</span>`;
            document.getElementById('historyReason').textContent = currentAppeal.review_reason || currentAppeal.reviewReason || 'No reason provided';
            document.getElementById('historyReviewer').textContent = (currentAppeal.reviewer_id || currentAppeal.reviewerId || 'Unknown').substring(0, 12);
            document.getElementById('historyReviewedAt').textContent = formatFullDate(currentAppeal.reviewed_at || currentAppeal.reviewedAt);
        }

        // Load appeal history if available
        await loadAppealHistory(currentAppeal.moderation_item_id || currentAppeal.moderationItemId);

        // Show modal
        new bootstrap.Modal(document.getElementById('appealModal')).show();
    } catch (error) {
        console.error('Error viewing appeal:', error);
        showToast('Failed to load appeal details', 'danger');
    }
}

// Load Appeal History
async function loadAppealHistory(moderationItemId) {
    if (!moderationItemId) {
        document.getElementById('timelineSection').style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`/api/appeals/case/${moderationItemId}`);
        if (!response.ok) throw new Error('Failed to fetch history');

        const data = await response.json();
        const history = data.appeals || [];

        if (history.length <= 1) {
            document.getElementById('timelineSection').style.display = 'none';
            return;
        }

        document.getElementById('timelineSection').style.display = 'block';
        const timeline = document.getElementById('appealTimeline');

        timeline.innerHTML = history.map(item => `
            <div class="timeline-item">
                <strong>${formatFullDate(item.created_at || item.createdAt)}</strong>
                <p>Status: <span class="badge badge-${item.status}">${formatStatus(item.status)}</span></p>
                ${item.review_reason || item.reviewReason ? `<p><small>${item.review_reason || item.reviewReason}</small></p>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading appeal history:', error);
        document.getElementById('timelineSection').style.display = 'none';
    }
}

// Submit Decision
async function submitDecision() {
    if (!currentAppeal) return;

    const decision = document.getElementById('decisionAction').value;
    const reason = document.getElementById('decisionReason').value;

    if (!reason.trim()) {
        showToast('Please provide a reason for your decision', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/appeals/${currentAppeal.id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision,
                reason,
                reviewerId: 'current-moderator' // TODO: Get from auth
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to submit decision');
        }

        showToast(`Appeal ${decision === 'approve' ? 'approved' : 'denied'} successfully`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('appealModal')).hide();
        loadAppeals();
        loadStats();

        // Reset form
        document.getElementById('decisionReason').value = '';
        document.getElementById('decisionAction').value = 'approve';
    } catch (error) {
        console.error('Error submitting decision:', error);
        showToast(`Failed to submit decision: ${error.message}`, 'danger');
    }
}

// Utility Functions
function formatStatus(status) {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

function formatFullDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = 'toast-' + Date.now();

    const bgClass = {
        'success': 'bg-success',
        'danger': 'bg-danger',
        'warning': 'bg-warning',
        'info': 'bg-info'
    }[type] || 'bg-info';

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center text-white ${bgClass} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastContainer.appendChild(toast);

    const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 3000 });
    bsToast.show();

    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}
