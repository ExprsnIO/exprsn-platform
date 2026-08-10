/**
 * Workflows Management JavaScript
 * Handles workflow automation creation, testing, and execution monitoring
 */

// Global state
let allWorkflows = [];
let filteredWorkflows = [];
let filters = {
    active: '',
    trigger: '',
    search: ''
};
let currentWorkflow = null;
let deleteWorkflowId = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupTheme();
    setupSidebar();
    setupSocket();
    await loadWorkflows();
    updateStats();
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

    socket.on('workflow:created', (workflow) => {
        console.log('New workflow created:', workflow);
        showToast('New workflow created', 'info');
        loadWorkflows();
    });

    socket.on('workflow:updated', (workflow) => {
        console.log('Workflow updated:', workflow);
        loadWorkflows();
    });

    socket.on('workflow:executed', (execution) => {
        console.log('Workflow executed:', execution);
        updateStats();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
}

// Load Workflows
async function loadWorkflows() {
    try {
        const response = await fetch('/api/workflows');
        if (!response.ok) throw new Error('Failed to fetch workflows');

        const data = await response.json();
        allWorkflows = data.workflows || [];
        applyFilters();
        updateStats();
    } catch (error) {
        console.error('Error loading workflows:', error);
        showToast('Failed to load workflows', 'danger');
        document.getElementById('workflowsTable').innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">Error loading workflows. Please try again.</td></tr>
        `;
    }
}

// Apply Filters
function applyFilters() {
    filters.active = document.getElementById('filterActive').value;
    filters.trigger = document.getElementById('filterTrigger').value;
    filters.search = document.getElementById('searchInput').value.toLowerCase();

    filteredWorkflows = allWorkflows.filter(workflow => {
        // Filter by active status
        if (filters.active !== '') {
            const isActive = filters.active === 'true';
            if (workflow.active !== isActive) return false;
        }

        // Filter by trigger type
        if (filters.trigger !== '') {
            const trigger = workflow.trigger || {};
            if (trigger.event !== filters.trigger) return false;
        }

        // Filter by search
        if (filters.search !== '') {
            const searchText = `${workflow.name} ${workflow.description || ''}`.toLowerCase();
            if (!searchText.includes(filters.search)) return false;
        }

        return true;
    });

    renderWorkflows(filteredWorkflows);
}

// Update Statistics
function updateStats() {
    const total = allWorkflows.length;
    const active = allWorkflows.filter(w => w.active).length;

    // Calculate executions and success rate
    let totalExecutions = 0;
    let successfulExecutions = 0;

    allWorkflows.forEach(workflow => {
        if (workflow.execution_count || workflow.executionCount) {
            totalExecutions += workflow.execution_count || workflow.executionCount || 0;
            successfulExecutions += workflow.success_count || workflow.successCount || 0;
        }
    });

    const successRate = totalExecutions > 0
        ? Math.round((successfulExecutions / totalExecutions) * 100)
        : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statExecutions').textContent = totalExecutions;
    document.getElementById('statSuccessRate').textContent = successRate + '%';
}

// Render Workflows Table
function renderWorkflows(workflows) {
    const tbody = document.getElementById('workflowsTable');

    if (workflows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No workflows found</td></tr>';
        return;
    }

    tbody.innerHTML = workflows.map(workflow => {
        const trigger = workflow.trigger || {};
        const actions = workflow.actions || [];
        const executionCount = workflow.execution_count || workflow.executionCount || 0;
        const lastRun = workflow.last_executed_at || workflow.lastExecutedAt;

        return `
            <tr>
                <td><strong>${escapeHtml(workflow.name)}</strong></td>
                <td><span class="badge bg-info">${formatTrigger(trigger.event)}</span></td>
                <td><span class="badge bg-secondary">${actions.length} action${actions.length !== 1 ? 's' : ''}</span></td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox"
                               ${workflow.active ? 'checked' : ''}
                               onchange="toggleWorkflowStatus('${workflow.id}', this.checked)">
                        <label class="form-check-label">
                            <span class="badge badge-${workflow.active ? 'active' : 'inactive'}">
                                ${workflow.active ? 'Active' : 'Inactive'}
                            </span>
                        </label>
                    </div>
                </td>
                <td>${executionCount}</td>
                <td>${lastRun ? formatDate(lastRun) : 'Never'}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary" onclick="showEditWorkflowModal('${workflow.id}')"
                                title="Edit Workflow">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-success" onclick="executeWorkflow('${workflow.id}')"
                                title="Execute Now">
                            <i class="bi bi-play-fill"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="viewExecutionHistory('${workflow.id}')"
                                title="View History">
                            <i class="bi bi-clock-history"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="showDeleteModal('${workflow.id}')"
                                title="Delete Workflow">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show Create Workflow Modal
function showCreateWorkflowModal() {
    currentWorkflow = null;
    document.getElementById('workflowModalLabel').textContent = 'Create Workflow';
    document.getElementById('workflowForm').reset();
    document.getElementById('workflowId').value = '';
    document.getElementById('workflowActive').value = 'true';

    // Set example trigger and actions
    document.getElementById('triggerConditions').value = JSON.stringify({
        severity: "high",
        contentType: "post"
    }, null, 2);

    document.getElementById('workflowActions').value = JSON.stringify([
        {
            type: "moderate",
            action: "flag",
            reason: "Flagged by automated workflow"
        },
        {
            type: "notify",
            target: "moderators",
            message: "High-severity content detected"
        }
    ], null, 2);

    new bootstrap.Modal(document.getElementById('workflowModal')).show();
}

// Show Edit Workflow Modal
async function showEditWorkflowModal(workflowId) {
    try {
        const workflow = allWorkflows.find(w => w.id === workflowId);
        if (!workflow) throw new Error('Workflow not found');

        currentWorkflow = workflow;

        document.getElementById('workflowModalLabel').textContent = 'Edit Workflow';
        document.getElementById('workflowId').value = workflow.id;
        document.getElementById('workflowName').value = workflow.name;
        document.getElementById('workflowDescription').value = workflow.description || '';
        document.getElementById('workflowActive').value = workflow.active.toString();

        const trigger = workflow.trigger || {};
        document.getElementById('triggerType').value = trigger.event || 'content_flagged';
        document.getElementById('triggerConditions').value = JSON.stringify(trigger.conditions || {}, null, 2);
        document.getElementById('workflowActions').value = JSON.stringify(workflow.actions || [], null, 2);

        new bootstrap.Modal(document.getElementById('workflowModal')).show();
    } catch (error) {
        console.error('Error loading workflow:', error);
        showToast('Failed to load workflow details', 'danger');
    }
}

// Update Trigger Conditions Template
function updateTriggerConditions() {
    const triggerType = document.getElementById('triggerType').value;
    const conditionsField = document.getElementById('triggerConditions');

    const templates = {
        content_flagged: { severity: "high", aiScore: { min: 0.8 } },
        report_submitted: { reason: "spam", count: { min: 3 } },
        user_warned: { warningCount: { min: 2 }, timeframe: "30d" },
        threshold_reached: { metric: "violations", threshold: 5 },
        manual: {}
    };

    conditionsField.value = JSON.stringify(templates[triggerType] || {}, null, 2);
}

// Save Workflow (Create or Update)
async function saveWorkflow() {
    try {
        // Validate form
        const form = document.getElementById('workflowForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Parse and validate JSON
        let triggerConditions, actions;
        try {
            triggerConditions = JSON.parse(document.getElementById('triggerConditions').value || '{}');
            actions = JSON.parse(document.getElementById('workflowActions').value);
        } catch (e) {
            showToast('Invalid JSON in conditions or actions field', 'danger');
            return;
        }

        const workflowData = {
            name: document.getElementById('workflowName').value,
            description: document.getElementById('workflowDescription').value,
            active: document.getElementById('workflowActive').value === 'true',
            trigger: {
                event: document.getElementById('triggerType').value,
                conditions: triggerConditions
            },
            actions: actions
        };

        const workflowId = document.getElementById('workflowId').value;
        const isEdit = !!workflowId;

        const response = await fetch(
            isEdit ? `/api/workflows/${workflowId}` : '/api/workflows',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflowData)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save workflow');
        }

        showToast(`Workflow ${isEdit ? 'updated' : 'created'} successfully`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('workflowModal')).hide();
        await loadWorkflows();
    } catch (error) {
        console.error('Error saving workflow:', error);
        showToast(`Failed to ${currentWorkflow ? 'update' : 'create'} workflow: ${error.message}`, 'danger');
    }
}

// Toggle Workflow Status (Active/Inactive)
async function toggleWorkflowStatus(workflowId, active) {
    try {
        const workflow = allWorkflows.find(w => w.id === workflowId);
        if (!workflow) return;

        const response = await fetch(`/api/workflows/${workflowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...workflow, active })
        });

        if (!response.ok) throw new Error('Failed to toggle workflow status');

        showToast(`Workflow ${active ? 'activated' : 'deactivated'} successfully`, 'success');
        await loadWorkflows();
    } catch (error) {
        console.error('Error toggling workflow status:', error);
        showToast('Failed to update workflow status', 'danger');
        await loadWorkflows();
    }
}

// Execute Workflow Manually
async function executeWorkflow(workflowId) {
    try {
        const response = await fetch(`/api/workflows/${workflowId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                triggerData: { manual: true }
            })
        });

        if (!response.ok) throw new Error('Failed to execute workflow');

        const result = await response.json();
        showToast('Workflow executed successfully', 'success');

        // Show execution result
        if (result.executionId) {
            setTimeout(() => viewExecutionDetails(result.executionId), 1000);
        }

        await loadWorkflows();
    } catch (error) {
        console.error('Error executing workflow:', error);
        showToast('Failed to execute workflow', 'danger');
    }
}

// View Execution History
async function viewExecutionHistory(workflowId) {
    try {
        const workflow = allWorkflows.find(w => w.id === workflowId);
        if (!workflow) throw new Error('Workflow not found');

        document.getElementById('execWorkflowName').textContent = workflow.name;

        // In a real implementation, this would fetch execution history
        // For now, show a placeholder
        const historyContainer = document.getElementById('executionHistory');
        historyContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="bi bi-info-circle"></i>
                Execution history tracking is available.
                Total executions: ${workflow.execution_count || workflow.executionCount || 0}
            </div>
            <p class="text-muted">Detailed execution logs would appear here.</p>
        `;

        new bootstrap.Modal(document.getElementById('executionModal')).show();
    } catch (error) {
        console.error('Error loading execution history:', error);
        showToast('Failed to load execution history', 'danger');
    }
}

// View Execution Details
async function viewExecutionDetails(executionId) {
    try {
        const response = await fetch(`/api/workflows/executions/${executionId}`);
        if (!response.ok) throw new Error('Failed to fetch execution details');

        const execution = await response.json();

        showToast(`Execution ${execution.status}: ${execution.message || ''}`,
                 execution.status === 'completed' ? 'success' : 'info');
    } catch (error) {
        console.error('Error loading execution details:', error);
    }
}

// Test Workflow
async function testWorkflow() {
    showToast('Workflow test functionality coming soon', 'info');
    // In a real implementation, this would send test data through the workflow
}

// Setup Default Workflows
async function setupDefaultWorkflows() {
    if (!confirm('This will create default moderation workflows. Continue?')) {
        return;
    }

    try {
        const response = await fetch('/api/workflows/setup-defaults', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to setup default workflows');

        const result = await response.json();
        showToast(`Created ${result.created || 0} default workflows`, 'success');
        await loadWorkflows();
    } catch (error) {
        console.error('Error setting up default workflows:', error);
        showToast('Failed to setup default workflows', 'danger');
    }
}

// Show Delete Confirmation Modal
function showDeleteModal(workflowId) {
    deleteWorkflowId = workflowId;
    const workflow = allWorkflows.find(w => w.id === workflowId);
    if (workflow) {
        document.getElementById('deleteWorkflowName').textContent = workflow.name;
        new bootstrap.Modal(document.getElementById('deleteModal')).show();
    }
}

// Confirm Delete Workflow
async function confirmDeleteWorkflow() {
    if (!deleteWorkflowId) return;

    try {
        const response = await fetch(`/api/workflows/${deleteWorkflowId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete workflow');

        showToast('Workflow deleted successfully', 'success');
        bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
        deleteWorkflowId = null;
        await loadWorkflows();
    } catch (error) {
        console.error('Error deleting workflow:', error);
        showToast('Failed to delete workflow', 'danger');
    }
}

// Utility Functions
function formatTrigger(event) {
    const triggers = {
        content_flagged: 'Content Flagged',
        report_submitted: 'Report Submitted',
        user_warned: 'User Warned',
        threshold_reached: 'Threshold Reached',
        manual: 'Manual'
    };
    return triggers[event] || event || 'Unknown';
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
