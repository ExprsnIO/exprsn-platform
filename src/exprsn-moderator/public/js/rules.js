/**
 * Rules Management JavaScript
 * Handles rule CRUD operations, testing, and real-time updates
 */

// Global state
let allRules = [];
let filteredRules = [];
let filters = {
    enabled: '',
    priority: '',
    search: ''
};
let currentRule = null;
let deleteRuleId = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupTheme();
    setupSidebar();
    setupSocket();
    await loadRules();
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

    socket.on('rule:created', (rule) => {
        console.log('New rule created:', rule);
        showToast('New rule created', 'info');
        loadRules();
    });

    socket.on('rule:updated', (rule) => {
        console.log('Rule updated:', rule);
        loadRules();
    });

    socket.on('rule:deleted', (ruleId) => {
        console.log('Rule deleted:', ruleId);
        showToast('Rule deleted', 'info');
        loadRules();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
}

// Load Rules
async function loadRules() {
    try {
        const response = await fetch('/api/rules');
        if (!response.ok) throw new Error('Failed to fetch rules');

        const data = await response.json();
        allRules = data.rules || [];
        applyFilters();
        updateStats();
    } catch (error) {
        console.error('Error loading rules:', error);
        showToast('Failed to load rules', 'danger');
        document.getElementById('rulesTable').innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">Error loading rules. Please try again.</td></tr>
        `;
    }
}

// Apply Filters
function applyFilters() {
    filters.enabled = document.getElementById('filterEnabled').value;
    filters.priority = document.getElementById('filterPriority').value;
    filters.search = document.getElementById('searchInput').value.toLowerCase();

    filteredRules = allRules.filter(rule => {
        // Filter by enabled status
        if (filters.enabled !== '') {
            const isEnabled = filters.enabled === 'true';
            if (rule.enabled !== isEnabled) return false;
        }

        // Filter by priority
        if (filters.priority !== '') {
            if (rule.priority !== filters.priority) return false;
        }

        // Filter by search
        if (filters.search !== '') {
            const searchText = `${rule.name} ${rule.description || ''}`.toLowerCase();
            if (!searchText.includes(filters.search)) return false;
        }

        return true;
    });

    renderRules(filteredRules);
}

// Update Statistics
function updateStats() {
    const total = allRules.length;
    const enabled = allRules.filter(r => r.enabled).length;
    const disabled = allRules.filter(r => !r.enabled).length;
    const highPriority = allRules.filter(r => r.priority === 'high').length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statEnabled').textContent = enabled;
    document.getElementById('statDisabled').textContent = disabled;
    document.getElementById('statHighPriority').textContent = highPriority;
}

// Render Rules Table
function renderRules(rules) {
    const tbody = document.getElementById('rulesTable');

    if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No rules found</td></tr>';
        return;
    }

    tbody.innerHTML = rules.map(rule => `
        <tr>
            <td><strong>${escapeHtml(rule.name)}</strong></td>
            <td>${escapeHtml(rule.description || 'No description')}</td>
            <td><span class="priority-${rule.priority}">${formatPriority(rule.priority)}</span></td>
            <td><span class="badge bg-secondary">${rule.content_type || rule.contentType || 'all'}</span></td>
            <td>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox"
                           ${rule.enabled ? 'checked' : ''}
                           onchange="toggleRuleStatus('${rule.id}', this.checked)">
                    <label class="form-check-label">
                        <span class="badge badge-${rule.enabled ? 'enabled' : 'disabled'}">
                            ${rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </label>
                </div>
            </td>
            <td>${formatDate(rule.created_at || rule.createdAt)}</td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary" onclick="showEditRuleModal('${rule.id}')"
                            title="Edit Rule">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-info" onclick="showTestRuleModal('${rule.id}')"
                            title="Test Rule">
                        <i class="bi bi-play-circle"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="showDeleteModal('${rule.id}')"
                            title="Delete Rule">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Show Create Rule Modal
function showCreateRuleModal() {
    currentRule = null;
    document.getElementById('ruleModalLabel').textContent = 'Create Rule';
    document.getElementById('ruleForm').reset();
    document.getElementById('ruleId').value = '';
    document.getElementById('ruleEnabled').value = 'true';
    document.getElementById('rulePriority').value = 'medium';

    // Set example conditions
    document.getElementById('ruleConditions').value = JSON.stringify({
        contains: {
            keywords: ["spam", "scam"],
            matchAny: true
        },
        aiScore: {
            toxicity: { min: 0.8 }
        }
    }, null, 2);

    new bootstrap.Modal(document.getElementById('ruleModal')).show();
}

// Show Edit Rule Modal
async function showEditRuleModal(ruleId) {
    try {
        const response = await fetch(`/api/rules/${ruleId}`);
        if (!response.ok) throw new Error('Failed to fetch rule');

        const data = await response.json();
        currentRule = data.rule;

        document.getElementById('ruleModalLabel').textContent = 'Edit Rule';
        document.getElementById('ruleId').value = currentRule.id;
        document.getElementById('ruleName').value = currentRule.name;
        document.getElementById('ruleDescription').value = currentRule.description || '';
        document.getElementById('rulePriority').value = currentRule.priority;
        document.getElementById('ruleEnabled').value = currentRule.enabled.toString();
        document.getElementById('ruleContentType').value = currentRule.content_type || currentRule.contentType || 'all';
        document.getElementById('ruleAction').value = currentRule.action;
        document.getElementById('ruleConditions').value = JSON.stringify(currentRule.conditions, null, 2);

        new bootstrap.Modal(document.getElementById('ruleModal')).show();
    } catch (error) {
        console.error('Error loading rule:', error);
        showToast('Failed to load rule details', 'danger');
    }
}

// Save Rule (Create or Update)
async function saveRule() {
    try {
        // Validate form
        const form = document.getElementById('ruleForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Parse and validate JSON conditions
        const conditionsText = document.getElementById('ruleConditions').value;
        let conditions;
        try {
            conditions = JSON.parse(conditionsText);
        } catch (e) {
            showToast('Invalid JSON in conditions field', 'danger');
            return;
        }

        const ruleData = {
            name: document.getElementById('ruleName').value,
            description: document.getElementById('ruleDescription').value,
            priority: document.getElementById('rulePriority').value,
            enabled: document.getElementById('ruleEnabled').value === 'true',
            contentType: document.getElementById('ruleContentType').value,
            action: document.getElementById('ruleAction').value,
            conditions: conditions
        };

        const ruleId = document.getElementById('ruleId').value;
        const isEdit = !!ruleId;

        const response = await fetch(
            isEdit ? `/api/rules/${ruleId}` : '/api/rules',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ruleData)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save rule');
        }

        showToast(`Rule ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('ruleModal')).hide();
        await loadRules();
    } catch (error) {
        console.error('Error saving rule:', error);
        showToast(`Failed to ${currentRule ? 'update' : 'create'} rule: ${error.message}`, 'danger');
    }
}

// Toggle Rule Status (Enable/Disable)
async function toggleRuleStatus(ruleId, enabled) {
    try {
        const endpoint = enabled ? 'enable' : 'disable';
        const response = await fetch(`/api/rules/${ruleId}/${endpoint}`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to toggle rule status');

        showToast(`Rule ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
        await loadRules();
    } catch (error) {
        console.error('Error toggling rule status:', error);
        showToast('Failed to update rule status', 'danger');
        // Reload to reset checkbox
        await loadRules();
    }
}

// Show Test Rule Modal
async function showTestRuleModal(ruleId) {
    try {
        const response = await fetch(`/api/rules/${ruleId}`);
        if (!response.ok) throw new Error('Failed to fetch rule');

        const data = await response.json();
        currentRule = data.rule;

        document.getElementById('testRuleName').textContent = currentRule.name;
        document.getElementById('testContent').value = '';
        document.getElementById('testMetadata').value = '';
        document.getElementById('testResultContainer').innerHTML = '';

        new bootstrap.Modal(document.getElementById('testRuleModal')).show();
    } catch (error) {
        console.error('Error loading rule:', error);
        showToast('Failed to load rule details', 'danger');
    }
}

// Run Rule Test
async function runRuleTest() {
    if (!currentRule) return;

    const content = document.getElementById('testContent').value;
    if (!content.trim()) {
        showToast('Please enter sample content to test', 'warning');
        return;
    }

    // Parse metadata if provided
    let metadata = {};
    const metadataText = document.getElementById('testMetadata').value;
    if (metadataText.trim()) {
        try {
            metadata = JSON.parse(metadataText);
        } catch (e) {
            showToast('Invalid JSON in metadata field', 'danger');
            return;
        }
    }

    try {
        const response = await fetch(`/api/rules/${currentRule.id}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                metadata
            })
        });

        if (!response.ok) throw new Error('Failed to test rule');

        const result = await response.json();
        displayTestResult(result);
    } catch (error) {
        console.error('Error testing rule:', error);
        showToast('Failed to test rule', 'danger');
    }
}

// Display Test Result
function displayTestResult(result) {
    const container = document.getElementById('testResultContainer');
    const matched = result.matched || result.match;
    const matchedConditions = result.matchedConditions || result.matched_conditions || [];
    const failedConditions = result.failedConditions || result.failed_conditions || [];

    let html = `
        <div class="test-result ${matched ? 'match' : 'no-match'}">
            <h6>
                <i class="bi bi-${matched ? 'check-circle-fill text-success' : 'x-circle-fill text-secondary'}"></i>
                ${matched ? 'Rule Matched' : 'Rule Did Not Match'}
            </h6>
            <p><strong>Action that would be taken:</strong> ${matched ? result.action : 'None (no match)'}</p>
    `;

    if (matchedConditions.length > 0) {
        html += '<p><strong>Matched Conditions:</strong></p><ul>';
        matchedConditions.forEach(condition => {
            html += `<li class="text-success">${escapeHtml(condition)}</li>`;
        });
        html += '</ul>';
    }

    if (failedConditions.length > 0) {
        html += '<p><strong>Failed Conditions:</strong></p><ul>';
        failedConditions.forEach(condition => {
            html += `<li class="text-secondary">${escapeHtml(condition)}</li>`;
        });
        html += '</ul>';
    }

    if (result.details) {
        html += `<p><strong>Details:</strong> ${escapeHtml(result.details)}</p>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// Show Delete Confirmation Modal
function showDeleteModal(ruleId) {
    deleteRuleId = ruleId;
    const rule = allRules.find(r => r.id === ruleId);
    if (rule) {
        document.getElementById('deleteRuleName').textContent = rule.name;
        new bootstrap.Modal(document.getElementById('deleteModal')).show();
    }
}

// Confirm Delete Rule
async function confirmDeleteRule() {
    if (!deleteRuleId) return;

    try {
        const response = await fetch(`/api/rules/${deleteRuleId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete rule');

        showToast('Rule deleted successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
        deleteRuleId = null;
        await loadRules();
    } catch (error) {
        console.error('Error deleting rule:', error);
        showToast('Failed to delete rule', 'danger');
    }
}

// Utility Functions
function formatPriority(priority) {
    return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Unknown';
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
