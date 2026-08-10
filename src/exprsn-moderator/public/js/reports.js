/**
 * Reports Management JavaScript
 * Handles report listing, filtering, viewing, and resolution
 */

// Global state
let currentPage = 1;
let pageSize = 50;
let filters = {
    status: '',
    contentType: '',
    reason: '',
    search: ''
};
let currentReport = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupTheme();
    setupSidebar();
    setupSocket();
    await loadReports();
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

    socket.on('report:new', (report) => {
        console.log('New report received:', report);
        showToast('New report submitted', 'info');
        loadReports();
        loadStats();
    });

    socket.on('report:updated', (report) => {
        console.log('Report updated:', report);
        loadReports();
        loadStats();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
}

// Load Reports
async function loadReports() {
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

        const response = await fetch(`/api/reports?${params}`);
        if (!response.ok) throw new Error('Failed to fetch reports');

        const data = await response.json();
        renderReports(data.reports || []);
        renderPagination(data.pagination || { total: 0 });
    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Failed to load reports', 'danger');
        document.getElementById('reportsTable').innerHTML = `
            <tr><td colspan="8" class="text-center text-danger">Error loading reports. Please try again.</td></tr>
        `;
    }
}

// Load Statistics
async function loadStats() {
    try {
        const response = await fetch('/api/reports?limit=1000'); // Get all for stats
        if (!response.ok) throw new Error('Failed to fetch stats');

        const data = await response.json();
        const reports = data.reports || [];

        const stats = {
            pending: reports.filter(r => r.status === 'pending').length,
            under_review: reports.filter(r => r.status === 'under_review').length,
            resolved: reports.filter(r => r.status === 'resolved').length,
            dismissed: reports.filter(r => r.status === 'dismissed').length
        };

        document.getElementById('statPending').textContent = stats.pending;
        document.getElementById('statUnderReview').textContent = stats.under_review;
        document.getElementById('statResolved').textContent = stats.resolved;
        document.getElementById('statDismissed').textContent = stats.dismissed;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Render Reports Table
function renderReports(reports) {
    const tbody = document.getElementById('reportsTable');

    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No reports found</td></tr>';
        return;
    }

    tbody.innerHTML = reports.map(report => `
        <tr>
            <td>${report.id.substring(0, 8)}</td>
            <td><span class="badge bg-secondary">${report.content_type || report.contentType}</span></td>
            <td><code class="small">${(report.content_id || report.contentId || '').substring(0, 12)}</code></td>
            <td><span class="badge bg-info">${report.reason}</span></td>
            <td><code class="small">${(report.reporter_id || report.reporterId || 'anonymous').substring(0, 12)}</code></td>
            <td><span class="badge badge-${report.status}">${formatStatus(report.status)}</span></td>
            <td>${formatDate(report.created_at || report.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="viewReport('${report.id}')">
                    <i class="bi bi-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
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
    loadReports();
}

// Apply Filters
function applyFilters() {
    filters.status = document.getElementById('filterStatus').value;
    filters.contentType = document.getElementById('filterContentType').value;
    filters.reason = document.getElementById('filterReason').value;
    filters.search = document.getElementById('searchInput').value;
    currentPage = 1;
    loadReports();
}

// View Report Details
async function viewReport(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`);
        if (!response.ok) throw new Error('Failed to fetch report');

        const data = await response.json();
        currentReport = data.report;

        // Populate modal
        document.getElementById('modalReportId').textContent = currentReport.id.substring(0, 12);
        document.getElementById('modalStatus').innerHTML = `<span class="badge badge-${currentReport.status}">${formatStatus(currentReport.status)}</span>`;
        document.getElementById('modalContentType').textContent = currentReport.content_type || currentReport.contentType;
        document.getElementById('modalContentId').textContent = currentReport.content_id || currentReport.contentId;
        document.getElementById('modalReason').textContent = currentReport.reason;
        document.getElementById('modalReporterId').textContent = (currentReport.reporter_id || currentReport.reporterId || 'anonymous').substring(0, 12);
        document.getElementById('modalCreatedAt').textContent = formatDate(currentReport.created_at || currentReport.createdAt);
        document.getElementById('modalUpdatedAt').textContent = formatDate(currentReport.updated_at || currentReport.updatedAt);
        document.getElementById('modalDescription').textContent = currentReport.description || 'No description provided';

        // Show content if available
        if (currentReport.content) {
            document.getElementById('modalContentSection').style.display = 'block';
            document.getElementById('modalContent').textContent = currentReport.content;
        } else {
            document.getElementById('modalContentSection').style.display = 'none';
        }

        // Show metadata if available
        if (currentReport.metadata) {
            document.getElementById('modalMetadataSection').style.display = 'block';
            document.getElementById('modalMetadata').textContent = JSON.stringify(currentReport.metadata, null, 2);
        } else {
            document.getElementById('modalMetadataSection').style.display = 'none';
        }

        // Show review button only for pending reports
        const reviewButton = document.getElementById('reviewButton');
        const resolveButton = document.getElementById('resolveButton');
        const resolutionSection = document.getElementById('resolutionSection');
        const resolutionNotesSection = document.getElementById('resolutionNotesSection');
        const moderationActionSection = document.getElementById('moderationActionSection');

        if (currentReport.status === 'pending' || currentReport.status === 'under_review') {
            reviewButton.style.display = 'inline-block';
            resolveButton.style.display = 'none';
            resolutionSection.style.display = 'none';
            resolutionNotesSection.style.display = 'none';
            moderationActionSection.style.display = 'none';
        } else {
            reviewButton.style.display = 'none';
            resolveButton.style.display = 'none';
            resolutionSection.style.display = 'none';
            resolutionNotesSection.style.display = 'none';
            moderationActionSection.style.display = 'none';
        }

        // Show modal
        new bootstrap.Modal(document.getElementById('reportModal')).show();
    } catch (error) {
        console.error('Error viewing report:', error);
        showToast('Failed to load report details', 'danger');
    }
}

// Start Review Process
function startReview() {
    document.getElementById('reviewButton').style.display = 'none';
    document.getElementById('resolveButton').style.display = 'inline-block';
    document.getElementById('resolutionSection').style.display = 'block';
    document.getElementById('resolutionNotesSection').style.display = 'block';
    document.getElementById('moderationActionSection').style.display = 'block';
}

// Resolve Report
async function resolveReport() {
    if (!currentReport) return;

    const action = document.getElementById('resolutionAction').value;
    const notes = document.getElementById('resolutionNotes').value;
    const moderationAction = document.getElementById('moderationAction').value;

    if (!notes.trim()) {
        showToast('Please provide resolution notes', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/reports/${currentReport.id}/resolve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: action,
                notes,
                moderationAction: action === 'resolved' ? moderationAction : null,
                moderatorId: 'current-moderator' // TODO: Get from auth
            })
        });

        if (!response.ok) throw new Error('Failed to resolve report');

        showToast('Report resolved successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('reportModal')).hide();
        loadReports();
        loadStats();

        // Reset form
        document.getElementById('resolutionNotes').value = '';
        document.getElementById('resolutionAction').value = 'resolved';
        document.getElementById('moderationAction').value = 'warn';
    } catch (error) {
        console.error('Error resolving report:', error);
        showToast('Failed to resolve report', 'danger');
    }
}

// Utility Functions
function formatStatus(status) {
    return status ? status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown';
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
