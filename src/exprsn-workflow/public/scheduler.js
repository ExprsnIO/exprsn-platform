let schedules = [];
let workflows = [];
let presets = {};
let selectedPreset = null;
let selectedWorkflow = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSchedules();
    loadWorkflows();
    loadPresets();

    // Event listeners
    document.getElementById('custom-type').addEventListener('change', updateCustomFields);
    document.getElementById('cron-expression').addEventListener('input', updateNextExecutions);
    document.getElementById('create-schedule-btn').addEventListener('click', createSchedule);
});

async function loadSchedules() {
    try {
        const res = await fetch('/api/scheduler/scheduled').then(r => r.json());

        if (res.success) {
            schedules = res.data;
            renderSchedules();
            updateStats();
        }
    } catch (error) {
        console.error('Error loading schedules:', error);
    }
}

async function loadWorkflows() {
    try {
        const res = await fetch('/api/workflows').then(r => r.json());

        if (res.success) {
            workflows = res.data.filter(w => w.status === 'active');
            renderWorkflowSelect();
        }
    } catch (error) {
        console.error('Error loading workflows:', error);
    }
}

async function loadPresets() {
    try {
        const res = await fetch('/api/scheduler/presets').then(r => r.json());

        if (res.success) {
            presets = res.data;
            renderPresets();
        }
    } catch (error) {
        console.error('Error loading presets:', error);
    }
}

function renderSchedules() {
    const container = document.getElementById('schedules-list');

    if (schedules.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-calendar-x" style="font-size: 4rem; color: #ccc;"></i>
                <h4 class="mt-3">No scheduled workflows</h4>
                <p class="text-muted">Create your first schedule to automate workflows</p>
            </div>
        `;
        return;
    }

    container.innerHTML = schedules.map(schedule => `
        <div class="card schedule-card mb-3">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-4">
                        <h5 class="mb-1">${escapeHtml(schedule.workflowName)}</h5>
                        <p class="text-muted mb-0 small">
                            <i class="bi bi-clock"></i> ${schedule.description || schedule.schedule}
                        </p>
                    </div>
                    <div class="col-md-3">
                        <small class="text-muted">Next Execution:</small><br>
                        <strong>${schedule.nextExecution ? new Date(schedule.nextExecution).toLocaleString() : 'N/A'}</strong>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted">Timezone:</small><br>
                        <strong>${schedule.timezone || 'UTC'}</strong>
                    </div>
                    <div class="col-md-1 text-center">
                        <span class="status-badge ${schedule.running ? 'bg-success' : 'bg-warning'} text-white">
                            ${schedule.running ? 'Running' : 'Paused'}
                        </span>
                    </div>
                    <div class="col-md-2 text-end">
                        <button class="btn btn-sm ${schedule.enabled ? 'btn-warning' : 'btn-success'}"
                                onclick="toggleSchedule('${schedule.workflowId}', ${!schedule.enabled})">
                            <i class="bi bi-${schedule.enabled ? 'pause' : 'play'}-circle"></i>
                            ${schedule.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${schedule.workflowId}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderWorkflowSelect() {
    const select = document.getElementById('workflow-select');
    select.innerHTML = '<option value="">Choose a workflow...</option>' +
        workflows.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

    select.addEventListener('change', (e) => {
        selectedWorkflow = e.target.value;
    });
}

function renderPresets() {
    const container = document.getElementById('schedule-presets');
    const groupedPresets = {};

    // Group by category
    for (const [key, preset] of Object.entries(presets)) {
        if (!groupedPresets[preset.category]) {
            groupedPresets[preset.category] = [];
        }
        groupedPresets[preset.category].push({ key, ...preset });
    }

    let html = '';
    for (const [category, categoryPresets] of Object.entries(groupedPresets)) {
        html += `<div class="col-12"><h6 class="mt-2">${category}</h6></div>`;
        html += categoryPresets.map(preset => `
            <div class="col">
                <div class="card preset-card" onclick="selectPreset('${preset.key}')">
                    <div class="card-body">
                        <h6>${preset.name}</h6>
                        <p class="small text-muted mb-1">${preset.description}</p>
                        <code class="small">${preset.schedule}</code>
                    </div>
                </div>
            </div>
        `).join('');
    }

    container.innerHTML = html;
}

function selectPreset(key) {
    selectedPreset = key;

    // Update UI
    document.querySelectorAll('.preset-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.target.closest('.preset-card').classList.add('selected');

    // Set cron expression
    const preset = presets[key];
    if (preset) {
        document.getElementById('cron-expression').value = preset.schedule;
        updateNextExecutions();
    }
}

function updateCustomFields() {
    const type = document.getElementById('custom-type').value;
    const container = document.getElementById('custom-fields');

    let html = '';

    switch (type) {
        case 'every-n-minutes':
            html = `
                <div class="mb-3">
                    <label class="form-label">Every N Minutes</label>
                    <input type="number" class="form-control" id="interval" min="1" max="59" value="5">
                </div>
            `;
            break;

        case 'every-n-hours':
            html = `
                <div class="mb-3">
                    <label class="form-label">Every N Hours</label>
                    <input type="number" class="form-control" id="interval" min="1" max="23" value="1">
                </div>
            `;
            break;

        case 'daily-at-time':
            html = `
                <div class="mb-3">
                    <label class="form-label">Time (24-hour format)</label>
                    <div class="row">
                        <div class="col">
                            <input type="number" class="form-control" id="hour" min="0" max="23" value="9" placeholder="Hour">
                        </div>
                        <div class="col">
                            <input type="number" class="form-control" id="minute" min="0" max="59" value="0" placeholder="Minute">
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'weekly-on-day':
            html = `
                <div class="mb-3">
                    <label class="form-label">Day of Week</label>
                    <select class="form-select" id="dayOfWeek">
                        <option value="0">Sunday</option>
                        <option value="1">Monday</option>
                        <option value="2">Tuesday</option>
                        <option value="3">Wednesday</option>
                        <option value="4">Thursday</option>
                        <option value="5">Friday</option>
                        <option value="6">Saturday</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Time (24-hour format)</label>
                    <div class="row">
                        <div class="col">
                            <input type="number" class="form-control" id="hour" min="0" max="23" value="9">
                        </div>
                        <div class="col">
                            <input type="number" class="form-control" id="minute" min="0" max="59" value="0">
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'monthly-on-day':
            html = `
                <div class="mb-3">
                    <label class="form-label">Day of Month</label>
                    <input type="number" class="form-control" id="dayOfMonth" min="1" max="31" value="1">
                </div>
                <div class="mb-3">
                    <label class="form-label">Time (24-hour format)</label>
                    <div class="row">
                        <div class="col">
                            <input type="number" class="form-control" id="hour" min="0" max="23" value="9">
                        </div>
                        <div class="col">
                            <input type="number" class="form-control" id="minute" min="0" max="59" value="0">
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    container.innerHTML = html;
}

async function updateNextExecutions() {
    const cronExpr = document.getElementById('cron-expression').value;
    const timezone = document.getElementById('timezone').value;

    if (!cronExpr) return;

    try {
        const res = await fetch('/api/scheduler/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: cronExpr, timezone })
        }).then(r => r.json());

        if (res.success && res.data.nextExecutions) {
            const html = res.data.nextExecutions.map((time, i) =>
                `<div>${i + 1}. ${new Date(time).toLocaleString()}</div>`
            ).join('');
            document.getElementById('next-executions').innerHTML = html;
        } else {
            document.getElementById('next-executions').innerHTML =
                '<span class="text-danger">Invalid cron expression</span>';
        }
    } catch (error) {
        console.error('Error validating schedule:', error);
    }
}

async function createSchedule() {
    if (!selectedWorkflow) {
        alert('Please select a workflow');
        return;
    }

    const cronExpr = document.getElementById('cron-expression').value;
    const timezone = document.getElementById('timezone').value;

    if (!cronExpr) {
        alert('Please configure a schedule');
        return;
    }

    try {
        const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');

        const res = await fetch(`/api/workflows/${selectedWorkflow}/schedule`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                schedule: cronExpr,
                timezone,
                enabled: true
            })
        }).then(r => r.json());

        if (res.success) {
            alert('Schedule created successfully!');
            bootstrap.Modal.getInstance(document.getElementById('createScheduleModal')).hide();
            loadSchedules();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (error) {
        alert('Error creating schedule: ' + error.message);
    }
}

async function toggleSchedule(workflowId, enabled) {
    try {
        const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');
        const action = enabled ? 'enable' : 'disable';

        const res = await fetch(`/api/scheduler/${workflowId}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());

        if (res.success) {
            loadSchedules();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteSchedule(workflowId) {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
        const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');

        const res = await fetch(`/api/scheduler/${workflowId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());

        if (res.success) {
            loadSchedules();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function updateStats() {
    const total = schedules.length;
    const running = schedules.filter(s => s.running).length;
    const paused = schedules.filter(s => !s.enabled).length;

    document.getElementById('total-scheduled').textContent = total;
    document.getElementById('total-running').textContent = running;
    document.getElementById('total-paused').textContent = paused;

    // Find next execution
    const nextExec = schedules
        .filter(s => s.nextExecution)
        .map(s => new Date(s.nextExecution))
        .sort((a, b) => a - b)[0];

    if (nextExec) {
        const timeUntil = Math.round((nextExec - new Date()) / 1000 / 60);
        document.getElementById('next-execution').textContent =
            timeUntil > 0 ? `${timeUntil}m` : 'Soon';
    } else {
        document.getElementById('next-execution').textContent = '--';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
