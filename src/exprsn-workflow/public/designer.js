// Enhanced Workflow Designer JavaScript with RBAC, Field Management, and Advanced Visualization

const canvas = document.getElementById('workflow-canvas');
const ctx = canvas.getContext('2d');
const propertiesPanel = document.getElementById('properties-panel');
const emptyState = document.getElementById('empty-state');

// Exprsn Services Configuration
const EXPRSN_SERVICES = [
    { id: 'ca', name: 'Certificate Authority', port: 3000, endpoints: ['tokens', 'certificates'] },
    { id: 'auth', name: 'Authentication', port: 3001, endpoints: ['login', 'register', 'oauth'] },
    { id: 'spark', name: 'Messaging', port: 3002, endpoints: ['messages', 'rooms', 'users'] },
    { id: 'timeline', name: 'Timeline', port: 3004, endpoints: ['posts', 'feed', 'interactions'] },
    { id: 'prefetch', name: 'Prefetch', port: 3005, endpoints: ['cache', 'refresh'] },
    { id: 'moderator', name: 'Moderator', port: 3006, endpoints: ['check', 'flag', 'review'] },
    { id: 'filevault', name: 'File Vault', port: 3007, endpoints: ['upload', 'download', 'delete'] },
    { id: 'gallery', name: 'Gallery', port: 3008, endpoints: ['albums', 'photos'] },
    { id: 'live', name: 'Live Streaming', port: 3009, endpoints: ['streams', 'events'] },
    { id: 'bridge', name: 'API Bridge', port: 3010, endpoints: ['proxy'] },
    { id: 'nexus', name: 'Nexus', port: 3011, endpoints: ['groups', 'events', 'calendar'] },
    { id: 'pulse', name: 'Analytics', port: 3012, endpoints: ['metrics', 'events'] },
    { id: 'vault', name: 'Secrets Vault', port: 3013, endpoints: ['secrets', 'keys'] },
    { id: 'herald', name: 'Herald', port: 3014, endpoints: ['notifications', 'alerts'] },
    { id: 'workflow', name: 'Workflow', port: 3017, endpoints: ['workflows', 'executions'] }
];

// State
let steps = [];
let connections = [];
let selectedStep = null;
let selectedConnection = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let stepCounter = 0;
let zoom = 1.0;
let connectionMode = false;
let connectionStart = null;
let gridSnap = false;
let gridSize = 20;

// User permissions (simulated - in production, fetch from backend)
let userPermissions = {
    services: ['ca', 'auth', 'timeline', 'workflow'], // Services user has access to
    roles: ['editor', 'viewer'],
    fields: {
        read: ['id', 'name', 'email', 'status', 'created_at'],
        write: ['name', 'status']
    }
};

// Step colors by type - theme-aware
function getStepColors() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';

    if (isDark) {
        return {
            action: '#2f81f7',
            condition: '#ff922b',
            loop: '#845ef7',
            javascript: '#ffd43b',
            api_call: '#22b8cf',
            data_transform: '#e64980',
            database: '#38d9a9',
            jsonlex: '#7950f2',
            service: '#1c7ed6',
            parallel: '#22b8cf',
            switch: '#f06595',
            wait: '#868e96',
            approval: '#51cf66',
            notification: '#ffd43b',
            subworkflow: '#845ef7'
        };
    } else {
        return {
            action: '#0d6efd',
            condition: '#fd7e14',
            loop: '#6f42c1',
            javascript: '#ffc107',
            api_call: '#0dcaf0',
            data_transform: '#d63384',
            database: '#20c997',
            jsonlex: '#6610f2',
            service: '#0a58ca',
            parallel: '#17a2b8',
            switch: '#e83e8c',
            wait: '#6c757d',
            approval: '#28a745',
            notification: '#ffc107',
            subworkflow: '#6f42c1'
        };
    }
}

// Get current theme colors
function getThemeColors() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';

    return {
        bgCanvas: isDark ? '#0d1117' : '#fafbfc',
        textPrimary: isDark ? '#e6edf3' : '#0d1117',
        textSecondary: isDark ? '#7d8590' : '#495057',
        borderColor: isDark ? '#30363d' : '#ced4da',
        connectionColor: isDark ? '#7d8590' : '#95a5a6',
        connectionSelected: isDark ? '#2f81f7' : '#0d6efd',
        gridColor: isDark ? '#21262d' : '#e0e0e0'
    };
}

// Initialize
document.querySelectorAll('.step-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('stepType', item.dataset.type);
    });
});

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
});

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const stepType = e.dataTransfer.getData('stepType');

    if (stepType) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left - panOffset.x) / zoom;
        let y = (e.clientY - rect.top - panOffset.y) / zoom;

        if (gridSnap) {
            x = Math.round(x / gridSize) * gridSize;
            y = Math.round(y / gridSize) * gridSize;
        }

        addStep(stepType, x, y);
        emptyState.style.display = 'none';
    }
});

// Canvas event handlers
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;

    // Check if clicking on a connection point for connection mode
    if (connectionMode) {
        const clickedStep = findStepAt(x, y);
        if (clickedStep) {
            if (!connectionStart) {
                connectionStart = clickedStep;
                render();
            } else {
                // Create connection
                addConnection(connectionStart.id, clickedStep.id);
                connectionStart = null;
                render();
            }
        }
        return;
    }

    // Check if clicking on a step
    const clickedStep = findStepAt(x, y);

    if (clickedStep) {
        selectedStep = clickedStep;
        selectedConnection = null;
        isDragging = true;
        dragOffset = {
            x: x - clickedStep.x,
            y: y - clickedStep.y
        };
        showProperties(clickedStep);
    } else {
        // Check if clicking on a connection
        const clickedConnection = findConnectionAt(x, y);
        if (clickedConnection) {
            selectedConnection = clickedConnection;
            selectedStep = null;
            showConnectionProperties(clickedConnection);
        } else {
            // Start panning
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            selectedStep = null;
            selectedConnection = null;
            showProperties(null);
        }
    }

    render();
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && selectedStep) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left - panOffset.x) / zoom;
        let y = (e.clientY - rect.top - panOffset.y) / zoom;

        selectedStep.x = x - dragOffset.x;
        selectedStep.y = y - dragOffset.y;

        if (gridSnap) {
            selectedStep.x = Math.round(selectedStep.x / gridSize) * gridSize;
            selectedStep.y = Math.round(selectedStep.y / gridSize) * gridSize;
        }

        render();
    } else if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;

        panOffset.x += dx;
        panOffset.y += dy;

        panStart = { x: e.clientX, y: e.clientY };

        render();
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    isPanning = false;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    zoom *= delta;
    zoom = Math.max(0.1, Math.min(zoom, 3));
    updateZoomDisplay();
    render();
});

// Add a new step
function addStep(type, x, y) {
    const step = {
        id: `step_${++stepCounter}`,
        type: type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} ${stepCounter}`,
        description: '',
        x: x,
        y: y,
        width: 150,
        height: 60,
        config: {},
        inputs: {},
        outputs: {},
        fields: [],
        conditions: null,
        next: null,
        order: steps.length
    };

    // Type-specific defaults
    if (type === 'service') {
        step.config.serviceId = null;
        step.config.endpoint = '';
        step.config.method = 'GET';
    } else if (type === 'database') {
        step.config.query = 'SELECT * FROM table WHERE id = $1';
        step.config.parameters = [];
    } else if (type === 'jsonlex') {
        step.config.schema = {};
        step.config.transform = '';
    }

    steps.push(step);
    render();
}

// Add connection between steps
function addConnection(fromId, toId) {
    // Check if connection already exists
    const exists = connections.find(c => c.from === fromId && c.to === toId);
    if (exists) return;

    connections.push({
        id: `conn_${Date.now()}`,
        from: fromId,
        to: toId,
        condition: null
    });
}

// Find step at coordinates
function findStepAt(x, y) {
    for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i];
        if (x >= step.x && x <= step.x + step.width &&
            y >= step.y && y <= step.y + step.height) {
            return step;
        }
    }
    return null;
}

// Find connection at coordinates
function findConnectionAt(x, y) {
    for (const conn of connections) {
        const fromStep = steps.find(s => s.id === conn.from);
        const toStep = steps.find(s => s.id === conn.to);

        if (fromStep && toStep) {
            const fromX = fromStep.x + fromStep.width / 2;
            const fromY = fromStep.y + fromStep.height;
            const toX = toStep.x + toStep.width / 2;
            const toY = toStep.y;

            // Check if click is near the line
            const distance = distanceToLineSegment(x, y, fromX, fromY, toX, toY);
            if (distance < 10) {
                return conn;
            }
        }
    }
    return null;
}

// Calculate distance from point to line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Render canvas with enhanced visualization
function render() {
    const themeColors = getThemeColors();
    const stepColors = getStepColors();

    // Clear with theme background
    ctx.fillStyle = themeColors.bgCanvas;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw grid if snap is enabled
    if (gridSnap) {
        drawGrid();
    }

    // Draw connections with enhanced arrows
    connections.forEach(conn => {
        const fromStep = steps.find(s => s.id === conn.from);
        const toStep = steps.find(s => s.id === conn.to);

        if (fromStep && toStep) {
            const fromX = fromStep.x + fromStep.width / 2;
            const fromY = fromStep.y + fromStep.height;
            const toX = toStep.x + toStep.width / 2;
            const toY = toStep.y;

            const isSelected = conn === selectedConnection;

            // Draw curved line with glow effect for selected
            if (isSelected) {
                ctx.shadowColor = themeColors.connectionSelected;
                ctx.shadowBlur = 10;
            }

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);

            const midY = (fromY + toY) / 2;
            ctx.bezierCurveTo(fromX, midY, toX, midY, toX, toY);

            ctx.strokeStyle = isSelected ? themeColors.connectionSelected : themeColors.connectionColor;
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.stroke();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Draw arrow
            const angle = Math.atan2(toY - midY, toX - toX);
            drawArrow(toX, toY, angle - Math.PI / 2, isSelected ? themeColors.connectionSelected : themeColors.connectionColor);

            // Draw condition label if exists
            if (conn.condition) {
                const labelX = (fromX + toX) / 2;
                const labelY = midY;

                // Background
                ctx.fillStyle = themeColors.bgCanvas;
                ctx.strokeStyle = themeColors.borderColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(labelX - 35, labelY - 12, 70, 24, 6);
                ctx.fill();
                ctx.stroke();

                // Text
                ctx.fillStyle = themeColors.textPrimary;
                ctx.font = 'bold 11px -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(conn.condition, labelX, labelY);
            }
        }
    });

    // Draw connection preview in connection mode
    if (connectionMode && connectionStart) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = themeColors.connectionSelected;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(
            connectionStart.x + connectionStart.width / 2,
            connectionStart.y + connectionStart.height
        );
        // Would need mouse position here - simplified for now
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw steps with enhanced card design
    steps.forEach(step => {
        const isSelected = step === selectedStep;
        const color = stepColors[step.type] || '#7f8c8d';

        // Enhanced shadow for depth
        if (isSelected) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
        } else {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
        }

        // Draw rounded rectangle for step
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(step.x, step.y, step.width, step.height, 8);
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Draw border with glow for selected
        if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
        }
        ctx.beginPath();
        ctx.roundRect(step.x, step.y, step.width, step.height, 8);
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Draw step name with better typography
        ctx.fillStyle = 'white';
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Truncate text if too long
        let displayName = step.name;
        const maxWidth = step.width - 30;
        const metrics = ctx.measureText(displayName);
        if (metrics.width > maxWidth) {
            while (ctx.measureText(displayName + '...').width > maxWidth && displayName.length > 0) {
                displayName = displayName.slice(0, -1);
            }
            displayName += '...';
        }

        ctx.fillText(displayName, step.x + step.width / 2, step.y + step.height / 2);

        // Draw order badge with modern design
        const badgeX = step.x + step.width - 18;
        const badgeY = step.y + 18;
        const badgeRadius = 14;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(step.order + 1, badgeX, badgeY);

        // Draw connection points with enhanced design
        const connPointColor = connectionMode ? '#27ae60' : 'rgba(255, 255, 255, 0.7)';
        const connPointRadius = connectionMode ? 7 : 5;

        // Bottom connection point
        ctx.fillStyle = connPointColor;
        ctx.beginPath();
        ctx.arc(step.x + step.width / 2, step.y + step.height, connPointRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Top connection point
        ctx.beginPath();
        ctx.arc(step.x + step.width / 2, step.y, connPointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
}

// Polyfill for roundRect if not available
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}

// Draw arrow with color parameter
function drawArrow(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -14);
    ctx.lineTo(8, -14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// Draw grid with theme support
function drawGrid() {
    const themeColors = getThemeColors();
    ctx.strokeStyle = themeColors.gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;

    for (let x = 0; x < canvas.width / zoom; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height / zoom);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height / zoom; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width / zoom, y);
        ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
}

// Show properties panel
function showProperties(step) {
    if (!step) {
        propertiesPanel.innerHTML = `
            <h3>Properties</h3>
            <p style="color: #95a5a6; font-size: 0.875rem;">Select a step to edit its properties</p>
        `;
        return;
    }

    let configFields = generateConfigFields(step);

    propertiesPanel.innerHTML = `
        <h3>Properties</h3>

        <div class="form-group">
            <label>Step Order</label>
            <input type="number" id="prop-order" value="${step.order + 1}" min="1" max="${steps.length}">
        </div>

        <div class="form-group">
            <label>Step ID</label>
            <input type="text" id="prop-id" value="${step.id}" disabled style="background: #ecf0f1;" />
        </div>

        <div class="form-group">
            <label>Step Name</label>
            <input type="text" id="prop-name" value="${step.name}" />
        </div>

        <div class="form-group">
            <label>Description</label>
            <textarea id="prop-description" rows="2">${step.description || ''}</textarea>
        </div>

        <div class="form-group">
            <label>Step Type</label>
            <input type="text" value="${step.type}" disabled style="background: #ecf0f1;" />
        </div>

        ${configFields}

        <div class="form-group">
            <button class="btn btn-small btn-primary" onclick="openFieldEditor()" style="width: 100%;">
                <i class="bi bi-pencil-square" aria-hidden="true"></i> Manage Fields
            </button>
        </div>

        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-primary" onclick="saveStepProperties()" style="flex: 1;">Save</button>
            <button class="btn btn-danger" onclick="deleteStep()">Delete</button>
        </div>
    `;
}

// Generate configuration fields based on step type
function generateConfigFields(step) {
    switch (step.type) {
        case 'service':
            return generateServiceFields(step);
        case 'database':
            return generateDatabaseFields(step);
        case 'jsonlex':
            return generateJSONLexFields(step);
        case 'action':
            return generateActionFields(step);
        case 'condition':
            return generateConditionFields(step);
        case 'javascript':
            return generateJavaScriptFields(step);
        case 'api_call':
            return generateApiCallFields(step);
        case 'data_transform':
            return generateDataTransformFields(step);
        case 'loop':
            return generateLoopFields(step);
        case 'parallel':
            return generateParallelFields(step);
        case 'switch':
            return generateSwitchFields(step);
        case 'wait':
            return generateWaitFields(step);
        case 'approval':
            return generateApprovalFields(step);
        case 'notification':
            return generateNotificationFields(step);
        case 'subworkflow':
            return generateSubworkflowFields(step);
        default:
            return '';
    }
}

// Service step fields
function generateServiceFields(step) {
    const availableServices = EXPRSN_SERVICES.filter(s =>
        userPermissions.services.includes(s.id)
    );

    return `
        <div class="form-group">
            <label>Service <span style="color: #e74c3c;">*</span></label>
            <button class="btn btn-small btn-secondary" onclick="openServiceSelector()" style="width: 100%;">
                ${step.config.serviceId ? EXPRSN_SERVICES.find(s => s.id === step.config.serviceId)?.name : 'Select Service'}
            </button>
        </div>

        <div class="form-group">
            <label>Endpoint</label>
            <input type="text" id="prop-endpoint" value="${step.config.endpoint || ''}" placeholder="/api/endpoint" />
        </div>

        <div class="form-group">
            <label>HTTP Method</label>
            <select id="prop-method">
                <option value="GET" ${step.config.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${step.config.method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${step.config.method === 'PUT' ? 'selected' : ''}>PUT</option>
                <option value="DELETE" ${step.config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                <option value="PATCH" ${step.config.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
            </select>
        </div>

        <div class="form-group">
            <label>Request Body (JSON)</label>
            <textarea id="prop-body" rows="4">${JSON.stringify(step.config.body || {}, null, 2)}</textarea>
        </div>

        <div class="form-group">
            <label>Response Mapping</label>
            <textarea id="prop-response-mapping" rows="3">${JSON.stringify(step.config.responseMapping || {}, null, 2)}</textarea>
        </div>

        <div class="form-group-inline">
            <input type="checkbox" id="prop-require-auth" ${step.config.requireAuth !== false ? 'checked' : ''} />
            <label for="prop-require-auth">Require CA Token Authentication</label>
        </div>
    `;
}

// Database step fields
function generateDatabaseFields(step) {
    return `
        <div class="form-group">
            <label>SQL Query</label>
            <textarea id="prop-query" rows="6" style="font-family: 'Courier New', monospace;">${step.config.query || 'SELECT * FROM table WHERE id = $1'}</textarea>
        </div>

        <div class="form-group">
            <label>Parameters (JSON Array)</label>
            <textarea id="prop-parameters" rows="2">${JSON.stringify(step.config.parameters || [], null, 2)}</textarea>
        </div>

        <div class="form-group">
            <label>Result Mapping</label>
            <input type="text" id="prop-result-field" value="${step.config.resultField || 'queryResult'}" placeholder="Variable name for results" />
        </div>

        <div class="form-group-inline">
            <input type="checkbox" id="prop-transaction" ${step.config.useTransaction ? 'checked' : ''} />
            <label for="prop-transaction">Use Transaction</label>
        </div>
    `;
}

// JSONLex step fields
function generateJSONLexFields(step) {
    return `
        <div class="form-group">
            <label>JSONLex Schema (JSON)</label>
            <textarea id="prop-jsonlex-schema" rows="6">${JSON.stringify(step.config.schema || {}, null, 2)}</textarea>
        </div>

        <div class="form-group">
            <label>Transform Expression (JSONata)</label>
            <textarea id="prop-jsonlex-transform" rows="4">${step.config.transform || '$.items[price > 100]'}</textarea>
        </div>

        <div class="form-group">
            <label>Input Data Source</label>
            <input type="text" id="prop-input-source" value="${step.config.inputSource || 'context.variables'}" />
        </div>

        <div class="form-group">
            <label>Output Target</label>
            <input type="text" id="prop-output-target" value="${step.config.outputTarget || 'result'}" />
        </div>

        <div class="form-group-inline">
            <input type="checkbox" id="prop-strict-validation" ${step.config.strictValidation ? 'checked' : ''} />
            <label for="prop-strict-validation">Strict Validation</label>
        </div>
    `;
}

// Other step type fields (simplified versions)
function generateActionFields(step) {
    return `
        <div class="form-group">
            <label>Action Type</label>
            <select id="prop-action">
                <option value="update_field" ${step.config.action === 'update_field' ? 'selected' : ''}>Update Field</option>
                <option value="send_notification" ${step.config.action === 'send_notification' ? 'selected' : ''}>Send Notification</option>
                <option value="log" ${step.config.action === 'log' ? 'selected' : ''}>Log Message</option>
            </select>
        </div>
        <div class="form-group">
            <label>Parameters (JSON)</label>
            <textarea id="prop-parameters">${JSON.stringify(step.config.parameters || {}, null, 2)}</textarea>
        </div>
    `;
}

function generateConditionFields(step) {
    return `
        <div class="form-group">
            <label>Condition Expression</label>
            <textarea id="prop-condition">${step.config.condition || 'context.variables.value > 10'}</textarea>
        </div>
    `;
}

function generateJavaScriptFields(step) {
    return `
        <div class="form-group">
            <label>JavaScript Code</label>
            <textarea id="prop-code" rows="10" style="font-family: 'Courier New', monospace;">${step.config.code || '// Enter JavaScript code\nreturn context.variables.result;'}</textarea>
        </div>
    `;
}

function generateApiCallFields(step) {
    return `
        <div class="form-group">
            <label>URL</label>
            <input type="text" id="prop-url" value="${step.config.url || 'https://api.example.com'}" />
        </div>
        <div class="form-group">
            <label>Method</label>
            <select id="prop-method">
                <option value="GET" ${step.config.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${step.config.method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${step.config.method === 'PUT' ? 'selected' : ''}>PUT</option>
                <option value="DELETE" ${step.config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
        </div>
    `;
}

function generateDataTransformFields(step) {
    return `
        <div class="form-group">
            <label>Source Field</label>
            <input type="text" id="prop-source-field" value="${step.config.sourceField || 'input.data'}" />
        </div>
        <div class="form-group">
            <label>Target Field</label>
            <input type="text" id="prop-target-field" value="${step.config.targetField || 'output.result'}" />
        </div>
        <div class="form-group">
            <label>Transform Code</label>
            <textarea id="prop-transform-code">${step.config.transformCode || 'output = input.map(item => item.value);'}</textarea>
        </div>
    `;
}

function generateLoopFields(step) {
    return `
        <div class="form-group">
            <label>Collection Variable</label>
            <input type="text" id="prop-collection" value="${step.config.collection || 'items'}" />
        </div>
        <div class="form-group">
            <label>Item Variable</label>
            <input type="text" id="prop-item-variable" value="${step.config.itemVariable || 'item'}" />
        </div>
    `;
}

function generateParallelFields(step) {
    return `
        <div class="form-group">
            <label>Parallel Steps (Comma-separated Step IDs)</label>
            <textarea id="prop-parallel-steps">${(step.config.steps || []).join(', ')}</textarea>
        </div>
        <div class="form-group-inline">
            <input type="checkbox" id="prop-fail-fast" ${step.config.failFast ? 'checked' : ''} />
            <label for="prop-fail-fast">Fail Fast (stop on first error)</label>
        </div>
    `;
}

function generateSwitchFields(step) {
    return `
        <div class="form-group">
            <label>Switch Expression</label>
            <input type="text" id="prop-switch-expression" value="${step.config.expression || 'context.variables.value'}" />
        </div>
        <div class="form-group">
            <label>Cases (JSON)</label>
            <textarea id="prop-switch-cases" rows="6">${JSON.stringify(step.config.cases || [{value: 'case1', nextStep: 'step_id', name: 'Case 1'}], null, 2)}</textarea>
        </div>
    `;
}

function generateWaitFields(step) {
    return `
        <div class="form-group">
            <label>Duration (milliseconds)</label>
            <input type="number" id="prop-wait-duration" value="${step.config.duration || 5000}" min="0" />
        </div>
        <div class="form-group">
            <label>Or use expression</label>
            <input type="text" id="prop-wait-expression" value="${step.config.durationExpression || ''}" placeholder="context.variables.delay" />
        </div>
    `;
}

function generateApprovalFields(step) {
    return `
        <div class="form-group">
            <label>Approvers (User IDs, comma-separated)</label>
            <textarea id="prop-approvers">${(step.config.approvers || []).join(', ')}</textarea>
        </div>
        <div class="form-group">
            <label>Approval Title</label>
            <input type="text" id="prop-approval-title" value="${step.config.title || 'Approval Required'}" />
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="prop-approval-description" rows="3">${step.config.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Due Date (optional)</label>
            <input type="datetime-local" id="prop-approval-due" value="${step.config.dueDate || ''}" />
        </div>
        <div class="form-group-inline">
            <input type="checkbox" id="prop-require-all" ${step.config.requireAllApprovals !== false ? 'checked' : ''} />
            <label for="prop-require-all">Require All Approvers</label>
        </div>
    `;
}

function generateNotificationFields(step) {
    return `
        <div class="form-group">
            <label>Notification Type</label>
            <select id="prop-notification-type">
                <option value="email" ${step.config.type === 'email' ? 'selected' : ''}>Email</option>
                <option value="push" ${step.config.type === 'push' ? 'selected' : ''}>Push Notification</option>
                <option value="sms" ${step.config.type === 'sms' ? 'selected' : ''}>SMS</option>
                <option value="webhook" ${step.config.type === 'webhook' ? 'selected' : ''}>Webhook</option>
            </select>
        </div>
        <div class="form-group">
            <label>Recipients (comma-separated)</label>
            <textarea id="prop-notification-recipients">${(step.config.recipients || []).join(', ')}</textarea>
        </div>
        <div class="form-group">
            <label>Subject</label>
            <input type="text" id="prop-notification-subject" value="${step.config.subject || ''}" />
        </div>
        <div class="form-group">
            <label>Message</label>
            <textarea id="prop-notification-message" rows="4">${step.config.message || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Priority</label>
            <select id="prop-notification-priority">
                <option value="low" ${step.config.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="normal" ${step.config.priority === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="high" ${step.config.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="urgent" ${step.config.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
        </div>
    `;
}

function generateSubworkflowFields(step) {
    return `
        <div class="form-group">
            <label>Workflow ID</label>
            <input type="text" id="prop-subworkflow-id" value="${step.config.workflowId || ''}" placeholder="UUID of workflow to execute" />
        </div>
        <div class="form-group">
            <label>Input Mapping (JSON)</label>
            <textarea id="prop-subworkflow-inputs" rows="4">${JSON.stringify(step.config.inputMapping || {}, null, 2)}</textarea>
        </div>
        <div class="form-group-inline">
            <input type="checkbox" id="prop-subworkflow-wait" ${step.config.waitForCompletion !== false ? 'checked' : ''} />
            <label for="prop-subworkflow-wait">Wait for Completion</label>
        </div>
    `;
}

// Show connection properties
function showConnectionProperties(conn) {
    const fromStep = steps.find(s => s.id === conn.from);
    const toStep = steps.find(s => s.id === conn.to);

    propertiesPanel.innerHTML = `
        <h3>Connection Properties</h3>

        <div class="form-group">
            <label>From Step</label>
            <input type="text" value="${fromStep?.name || 'Unknown'}" disabled style="background: #ecf0f1;" />
        </div>

        <div class="form-group">
            <label>To Step</label>
            <input type="text" value="${toStep?.name || 'Unknown'}" disabled style="background: #ecf0f1;" />
        </div>

        <div class="form-group">
            <label>Condition (optional)</label>
            <input type="text" id="prop-conn-condition" value="${conn.condition || ''}" placeholder="e.g., 'true', 'false', 'error'" />
        </div>

        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-primary" onclick="saveConnectionProperties()" style="flex: 1;">Save</button>
            <button class="btn btn-danger" onclick="deleteConnection()">Delete</button>
        </div>
    `;
}

// Save step properties
function saveStepProperties() {
    if (!selectedStep) return;

    selectedStep.name = document.getElementById('prop-name').value;
    selectedStep.description = document.getElementById('prop-description')?.value || '';

    // Update order
    const newOrder = parseInt(document.getElementById('prop-order').value) - 1;
    if (newOrder !== selectedStep.order && newOrder >= 0 && newOrder < steps.length) {
        reorderStep(selectedStep, newOrder);
    }

    // Save type-specific config
    try {
        switch (selectedStep.type) {
            case 'service':
                selectedStep.config.endpoint = document.getElementById('prop-endpoint').value;
                selectedStep.config.method = document.getElementById('prop-method').value;
                selectedStep.config.body = JSON.parse(document.getElementById('prop-body').value);
                selectedStep.config.responseMapping = JSON.parse(document.getElementById('prop-response-mapping').value);
                selectedStep.config.requireAuth = document.getElementById('prop-require-auth').checked;
                break;

            case 'database':
                selectedStep.config.query = document.getElementById('prop-query').value;
                selectedStep.config.parameters = JSON.parse(document.getElementById('prop-parameters').value);
                selectedStep.config.resultField = document.getElementById('prop-result-field').value;
                selectedStep.config.useTransaction = document.getElementById('prop-transaction').checked;
                break;

            case 'jsonlex':
                selectedStep.config.schema = JSON.parse(document.getElementById('prop-jsonlex-schema').value);
                selectedStep.config.transform = document.getElementById('prop-jsonlex-transform').value;
                selectedStep.config.inputSource = document.getElementById('prop-input-source').value;
                selectedStep.config.outputTarget = document.getElementById('prop-output-target').value;
                selectedStep.config.strictValidation = document.getElementById('prop-strict-validation').checked;
                break;

            case 'action':
                selectedStep.config.action = document.getElementById('prop-action').value;
                selectedStep.config.parameters = JSON.parse(document.getElementById('prop-parameters').value);
                break;

            case 'condition':
                selectedStep.config.condition = document.getElementById('prop-condition').value;
                break;

            case 'javascript':
                selectedStep.config.code = document.getElementById('prop-code').value;
                break;

            case 'api_call':
                selectedStep.config.url = document.getElementById('prop-url')?.value;
                selectedStep.config.method = document.getElementById('prop-method')?.value;
                break;

            case 'data_transform':
                selectedStep.config.sourceField = document.getElementById('prop-source-field').value;
                selectedStep.config.targetField = document.getElementById('prop-target-field').value;
                selectedStep.config.transformCode = document.getElementById('prop-transform-code').value;
                break;

            case 'loop':
                selectedStep.config.collection = document.getElementById('prop-collection').value;
                selectedStep.config.itemVariable = document.getElementById('prop-item-variable').value;
                break;

            case 'parallel':
                const parallelSteps = document.getElementById('prop-parallel-steps').value;
                selectedStep.config.steps = parallelSteps.split(',').map(s => s.trim()).filter(s => s);
                selectedStep.config.failFast = document.getElementById('prop-fail-fast').checked;
                break;

            case 'switch':
                selectedStep.config.expression = document.getElementById('prop-switch-expression').value;
                selectedStep.config.cases = JSON.parse(document.getElementById('prop-switch-cases').value);
                break;

            case 'wait':
                const duration = document.getElementById('prop-wait-duration').value;
                const expression = document.getElementById('prop-wait-expression').value;
                selectedStep.config.duration = expression || parseInt(duration);
                selectedStep.config.durationExpression = expression || null;
                break;

            case 'approval':
                const approvers = document.getElementById('prop-approvers').value;
                selectedStep.config.approvers = approvers.split(',').map(a => a.trim()).filter(a => a);
                selectedStep.config.title = document.getElementById('prop-approval-title').value;
                selectedStep.config.description = document.getElementById('prop-approval-description').value;
                selectedStep.config.dueDate = document.getElementById('prop-approval-due').value || null;
                selectedStep.config.requireAllApprovals = document.getElementById('prop-require-all').checked;
                break;

            case 'notification':
                const recipients = document.getElementById('prop-notification-recipients').value;
                selectedStep.config.type = document.getElementById('prop-notification-type').value;
                selectedStep.config.recipients = recipients.split(',').map(r => r.trim()).filter(r => r);
                selectedStep.config.subject = document.getElementById('prop-notification-subject').value;
                selectedStep.config.message = document.getElementById('prop-notification-message').value;
                selectedStep.config.priority = document.getElementById('prop-notification-priority').value;
                break;

            case 'subworkflow':
                selectedStep.config.workflowId = document.getElementById('prop-subworkflow-id').value;
                selectedStep.config.inputMapping = JSON.parse(document.getElementById('prop-subworkflow-inputs').value);
                selectedStep.config.waitForCompletion = document.getElementById('prop-subworkflow-wait').checked;
                break;
        }

        render();
        alert('Properties saved successfully!');
    } catch (e) {
        alert('Error saving properties: ' + e.message);
    }
}

// Save connection properties
function saveConnectionProperties() {
    if (!selectedConnection) return;

    selectedConnection.condition = document.getElementById('prop-conn-condition').value || null;

    render();
    alert('Connection saved successfully!');
}

// Delete step
function deleteStep() {
    if (!selectedStep) return;

    if (confirm('Are you sure you want to delete this step?')) {
        steps = steps.filter(s => s !== selectedStep);
        connections = connections.filter(c => c.from !== selectedStep.id && c.to !== selectedStep.id);

        // Reorder remaining steps
        steps.forEach((s, index) => s.order = index);

        selectedStep = null;
        showProperties(null);
        render();

        if (steps.length === 0) {
            emptyState.style.display = 'block';
        }
    }
}

// Delete connection
function deleteConnection() {
    if (!selectedConnection) return;

    if (confirm('Delete this connection?')) {
        connections = connections.filter(c => c !== selectedConnection);
        selectedConnection = null;
        showProperties(null);
        render();
    }
}

// Reorder step
function reorderStep(step, newOrder) {
    const oldOrder = step.order;

    if (newOrder > oldOrder) {
        steps.forEach(s => {
            if (s.order > oldOrder && s.order <= newOrder) {
                s.order--;
            }
        });
    } else {
        steps.forEach(s => {
            if (s.order >= newOrder && s.order < oldOrder) {
                s.order++;
            }
        });
    }

    step.order = newOrder;
    steps.sort((a, b) => a.order - b.order);
}

// Service selector
function openServiceSelector() {
    const modal = document.getElementById('service-modal');
    const serviceList = document.getElementById('service-list');

    const availableServices = EXPRSN_SERVICES.filter(s =>
        userPermissions.services.includes(s.id)
    );

    serviceList.innerHTML = availableServices.map(service => `
        <div class="service-item" data-service-id="${service.id}" onclick="selectServiceItem(this)">
            <div class="service-name">${service.name}</div>
            <div class="service-port">Port ${service.port}</div>
        </div>
    `).join('');

    modal.classList.add('active');
}

function selectServiceItem(element) {
    document.querySelectorAll('.service-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
}

function selectService() {
    const selectedElement = document.querySelector('.service-item.selected');
    if (selectedElement && selectedStep) {
        const serviceId = selectedElement.dataset.serviceId;
        selectedStep.config.serviceId = serviceId;
        closeServiceModal();
        showProperties(selectedStep);
    }
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.remove('active');
}

// Field editor
function openFieldEditor() {
    if (!selectedStep) return;

    const modal = document.getElementById('field-modal');
    const content = document.getElementById('field-editor-content');

    const readableFields = userPermissions.fields.read;
    const writableFields = userPermissions.fields.write;

    content.innerHTML = `
        <div class="form-group">
            <label>Available Fields (based on your permissions)</label>
            <div class="field-list">
                ${readableFields.map(field => `
                    <div class="field-item">
                        <div class="field-item-info">
                            <div class="field-item-name">${field}</div>
                            <div class="field-item-type">
                                ${writableFields.includes(field) ? 'Read/Write' : 'Read Only'}
                            </div>
                        </div>
                        <button class="btn btn-small btn-primary" onclick="addFieldToStep('${field}', ${writableFields.includes(field)})">
                            Add
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="form-group">
            <label>Selected Fields for This Step</label>
            <div class="field-list" id="selected-fields-list">
                ${(selectedStep.fields || []).map((field, index) => `
                    <div class="field-item">
                        <div class="field-item-info">
                            <div class="field-item-name">${field.name}</div>
                            <div class="field-item-type">${field.access}</div>
                        </div>
                        <button class="btn btn-small btn-danger" onclick="removeFieldFromStep(${index})">
                            Remove
                        </button>
                    </div>
                `).join('') || '<p style="color: #95a5a6; font-size: 0.875rem; padding: 1rem;">No fields selected</p>'}
            </div>
        </div>
    `;

    modal.classList.add('active');
}

function addFieldToStep(fieldName, writable) {
    if (!selectedStep.fields) {
        selectedStep.fields = [];
    }

    // Check if field already added
    if (selectedStep.fields.find(f => f.name === fieldName)) {
        alert('Field already added');
        return;
    }

    selectedStep.fields.push({
        name: fieldName,
        access: writable ? 'read/write' : 'read'
    });

    // Refresh the modal
    openFieldEditor();
}

function removeFieldFromStep(index) {
    if (selectedStep && selectedStep.fields) {
        selectedStep.fields.splice(index, 1);
        openFieldEditor();
    }
}

function saveFields() {
    closeFieldModal();
    alert('Fields updated successfully!');
}

function closeFieldModal() {
    document.getElementById('field-modal').classList.remove('active');
}

// Toolbar functions
function toggleConnectionMode() {
    connectionMode = !connectionMode;
    connectionStart = null;
    const btn = document.getElementById('connection-mode-btn');
    const icon = btn.querySelector('i');
    const text = btn.querySelector('span');

    btn.setAttribute('aria-pressed', connectionMode);
    text.textContent = connectionMode ? 'On' : 'Off';
    btn.classList.toggle('btn-success', connectionMode);
    btn.classList.toggle('btn-secondary', !connectionMode);

    render();
}

function toggleGridSnap() {
    gridSnap = !gridSnap;
    const btn = document.getElementById('grid-snap-btn');
    const icon = btn.querySelector('i');
    const text = btn.querySelector('span');

    btn.setAttribute('aria-pressed', gridSnap);
    text.textContent = gridSnap ? 'On' : 'Off';
    btn.classList.toggle('btn-success', gridSnap);
    btn.classList.toggle('btn-secondary', !gridSnap);

    render();
}

function zoomIn() {
    zoom = Math.min(zoom * 1.2, 3);
    updateZoomDisplay();
    render();
}

function zoomOut() {
    zoom = Math.max(zoom * 0.8, 0.1);
    updateZoomDisplay();
    render();
}

function resetZoom() {
    zoom = 1.0;
    panOffset = { x: 0, y: 0 };
    updateZoomDisplay();
    render();
}

function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
}

// Clear workflow
function clearWorkflow() {
    if (confirm('Clear entire workflow? This cannot be undone.')) {
        steps = [];
        connections = [];
        selectedStep = null;
        selectedConnection = null;
        stepCounter = 0;
        showProperties(null);
        render();
        emptyState.style.display = 'block';
    }
}

// Export workflow
function exportWorkflow() {
    const workflow = {
        name: document.getElementById('workflow-name').value,
        description: document.getElementById('workflow-description').value,
        version: '1.0',
        steps: steps.map(step => ({
            id: step.id,
            type: step.type,
            name: step.name,
            description: step.description,
            position: { x: step.x, y: step.y },
            config: step.config,
            inputs: step.inputs,
            outputs: step.outputs,
            fields: step.fields,
            next: step.next,
            order: step.order
        })),
        connections: connections,
        variables: {},
        settings: {}
    };

    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (workflow.name || 'workflow').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
    a.click();

    URL.revokeObjectURL(url);
    alert('Workflow exported successfully!');
}

// Save workflow
async function saveWorkflow() {
    const name = document.getElementById('workflow-name').value;
    const description = document.getElementById('workflow-description').value;

    if (!name) {
        alert('Please enter a workflow name');
        return;
    }

    const workflowData = {
        name: name,
        description: description,
        status: 'active',
        definition: {
            version: '1.0',
            steps: steps.map(step => ({
                id: step.id,
                type: step.type,
                name: step.name,
                description: step.description,
                position: { x: step.x, y: step.y },
                config: step.config,
                inputs: step.inputs,
                outputs: step.outputs,
                fields: step.fields,
                next: step.next,
                order: step.order
            })),
            connections: connections,
            variables: {},
            settings: {}
        },
        permissions: {
            viewer: ['view'],
            editor: ['view', 'execute', 'edit'],
            admin: ['view', 'execute', 'edit', 'delete']
        }
    };

    try {
        const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');

        const response = await fetch('/api/workflows', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(workflowData)
        });

        if (response.ok) {
            const result = await response.json();
            alert('Workflow saved successfully!\nWorkflow ID: ' + result.data.id);
            console.log('Saved workflow:', result.data);
        } else {
            const error = await response.json();
            alert('Failed to save workflow: ' + error.error);
        }
    } catch (error) {
        alert('Error saving workflow: ' + error.message);
        console.error('Save error:', error);
    }
}

// Initial render
render();
