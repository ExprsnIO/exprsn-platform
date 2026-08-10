const socket = io();
let executions = [];
let approvals = [];

socket.on('connect', () => {
    console.log('Connected to monitoring');
    loadData();
});

socket.on('execution:update', (data) => {
    const idx = executions.findIndex(e => e.id === data.id);
    if (idx >= 0) executions[idx] = data;
    else executions.unshift(data);
    render();
});

socket.on('execution:complete', (data) => {
    const idx = executions.findIndex(e => e.id === data.id);
    if (idx >= 0) executions.splice(idx, 1);
    loadHistory();
});

async function loadData() {
    const [runRes, appRes, histRes] = await Promise.all([
        fetch('/api/monitor/running').then(r => r.json()),
        fetch('/api/monitor/approvals').then(r => r.json()),
        fetch('/api/monitor/history?limit=50').then(r => r.json())
    ]);

    executions = runRes.data || [];
    approvals = appRes.data || [];

    render();
    renderApprovals();
    renderHistory(histRes.data || []);
    updateStats();
}

async function loadHistory() {
    const res = await fetch('/api/monitor/history?limit=50').then(r => r.json());
    renderHistory(res.data || []);
    updateStats();
}

function render() {
    const running = executions.filter(e => e.status === 'running');
    document.getElementById('running-list').innerHTML = running.length ? running.map(e => `
        <div class="card mb-2">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6>${e.workflow?.name || 'Unknown'}</h6>
                        <small class="text-muted">Started: ${new Date(e.started_at).toLocaleString()}</small>
                        <div class="mt-2">
                            <span class="badge bg-primary">Step ${e.completed_steps?.length || 0}/${e.workflow?.steps?.length || 0}</span>
                            ${e.current_step_id ? `<span class="badge bg-info">${e.current_step_id}</span>` : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="viewDetails('${e.id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                </div>
                <div class="progress mt-2" style="height: 4px;">
                    <div class="progress-bar" style="width: ${((e.completed_steps?.length || 0) / (e.workflow?.steps?.length || 1)) * 100}%"></div>
                </div>
            </div>
        </div>
    `).join('') : '<p class="text-muted">No running executions</p>';
}

function renderApprovals() {
    document.getElementById('approval-list').innerHTML = approvals.length ? approvals.map(a => `
        <div class="card mb-2">
            <div class="card-body">
                <h6>${a.title}</h6>
                <p class="mb-2">${a.description || ''}</p>
                <small class="text-muted">Workflow: ${a.workflow?.name}</small><br>
                <small class="text-muted">Requested: ${new Date(a.createdAt).toLocaleString()}</small>
                <div class="mt-3">
                    <button class="btn btn-sm btn-success" onclick="approve('${a.executionId}', '${a.stepId}')">
                        <i class="bi bi-check-circle"></i> Approve
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="reject('${a.executionId}', '${a.stepId}')">
                        <i class="bi bi-x-circle"></i> Reject
                    </button>
                </div>
            </div>
        </div>
    `).join('') : '<p class="text-muted">No pending approvals</p>';
}

function renderHistory(data) {
    document.getElementById('history-list').innerHTML = data.map(e => `
        <div class="card mb-2">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6>${e.workflow?.name || 'Unknown'}</h6>
                        <small class="text-muted">${new Date(e.completed_at).toLocaleString()}</small>
                        <div class="mt-2">
                            <span class="badge ${e.status === 'completed' ? 'bg-success' : e.status === 'failed' ? 'bg-danger' : 'bg-warning'}">
                                ${e.status}
                            </span>
                            ${e.duration ? `<span class="badge bg-secondary">${(e.duration / 1000).toFixed(1)}s</span>` : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="viewDetails('${e.id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function updateStats() {
    const res = await fetch('/api/monitor/stats').then(r => r.json());
    if (res.data) {
        document.getElementById('stat-running').textContent = res.data.running || 0;
        document.getElementById('stat-approval').textContent = res.data.waitingApproval || 0;
        document.getElementById('stat-completed').textContent = res.data.completedToday || 0;
        document.getElementById('stat-failed').textContent = res.data.failedToday || 0;
    }
}

async function viewDetails(id) {
    const res = await fetch(`/api/executions/${id}/status`).then(r => r.json());
    const e = res.data;

    document.getElementById('detail-title').textContent = `${e.workflow?.name} - ${e.status}`;
    document.getElementById('detail-content').innerHTML = `
        <div class="p-3">
            <h6>Execution Info</h6>
            <p><strong>ID:</strong> ${e.id}<br>
            <strong>Status:</strong> <span class="badge bg-${e.status === 'completed' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'}">${e.status}</span><br>
            <strong>Started:</strong> ${new Date(e.started_at).toLocaleString()}<br>
            ${e.completed_at ? `<strong>Completed:</strong> ${new Date(e.completed_at).toLocaleString()}<br>` : ''}
            ${e.duration ? `<strong>Duration:</strong> ${(e.duration / 1000).toFixed(2)}s<br>` : ''}</p>

            <h6 class="mt-3">Steps (${e.completed_steps?.length || 0}/${e.workflow?.steps?.length || 0})</h6>
            <div class="list-group">
                ${(e.workflow?.steps || []).map(s => {
                    const completed = e.completed_steps?.includes(s.step_id);
                    const failed = e.failed_steps?.includes(s.step_id);
                    const current = e.current_step_id === s.step_id;
                    return `
                        <div class="list-group-item ${current ? 'active' : ''}">
                            <div class="d-flex justify-content-between">
                                <span>${s.name}</span>
                                ${completed ? '<i class="bi bi-check-circle text-success"></i>' : ''}
                                ${failed ? '<i class="bi bi-x-circle text-danger"></i>' : ''}
                                ${current ? '<i class="bi bi-arrow-right"></i>' : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            ${e.logs && e.logs.length ? `
                <h6 class="mt-3">Recent Logs</h6>
                <div style="max-height: 200px; overflow-y: auto; font-size: 0.875rem; font-family: monospace;">
                    ${e.logs.slice(-20).map(l => `
                        <div class="mb-1">
                            <span class="badge bg-${l.level === 'error' ? 'danger' : l.level === 'warn' ? 'warning' : 'info'}">${l.level}</span>
                            ${l.message}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('detail-modal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
}

async function approve(executionId, stepId) {
    if (!confirm('Approve this step?')) return;

    const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');
    const res = await fetch(`/api/executions/${executionId}/steps/${stepId}/approve`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ comments: 'Approved via monitor' })
    }).then(r => r.json());

    if (res.success) {
        alert('Approved! Workflow will resume.');
        loadData();
    } else {
        alert('Error: ' + res.error);
    }
}

async function reject(executionId, stepId) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;

    const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');
    const res = await fetch(`/api/executions/${executionId}/steps/${stepId}/reject`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
    }).then(r => r.json());

    if (res.success) {
        alert('Rejected. Workflow stopped.');
        loadData();
    } else {
        alert('Error: ' + res.error);
    }
}

document.getElementById('search')?.addEventListener('input', async (e) => {
    const res = await fetch(`/api/monitor/history?search=${e.target.value}&limit=50`).then(r => r.json());
    renderHistory(res.data || []);
});

setInterval(updateStats, 30000);
