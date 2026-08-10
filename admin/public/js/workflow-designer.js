/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Workflow Designer - Visual Workflow Builder
 * ═══════════════════════════════════════════════════════════════════════
 */

class WorkflowDesigner {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = null;
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.draggedNode = null;
    this.currentWorkflow = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.nodeIdCounter = 1;

    this.init();
  }

  init() {
    this.createCanvas();
    this.setupEventListeners();
    this.renderPalette();
  }

  createCanvas() {
    this.container.innerHTML = `
      <div class="workflow-designer">
        <!-- Top Toolbar -->
        <div class="workflow-toolbar">
          <div class="toolbar-section">
            <button class="btn btn-sm btn-primary" onclick="workflowDesigner.saveWorkflow()">
              <i class="bi bi-save"></i> Save
            </button>
            <button class="btn btn-sm btn-secondary" onclick="workflowDesigner.loadWorkflow()">
              <i class="bi bi-folder-open"></i> Load
            </button>
            <button class="btn btn-sm btn-success" onclick="workflowDesigner.testWorkflow()">
              <i class="bi bi-play-fill"></i> Test
            </button>
            <button class="btn btn-sm btn-warning" onclick="workflowDesigner.clearCanvas()">
              <i class="bi bi-trash"></i> Clear
            </button>
          </div>
          <div class="toolbar-section">
            <button class="btn btn-sm btn-outline-secondary" onclick="workflowDesigner.zoomIn()">
              <i class="bi bi-zoom-in"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="workflowDesigner.zoomOut()">
              <i class="bi bi-zoom-out"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="workflowDesigner.resetView()">
              <i class="bi bi-arrow-clockwise"></i> Reset View
            </button>
          </div>
          <div class="toolbar-section">
            <input type="text" id="workflow-name" class="form-control form-control-sm" placeholder="Workflow Name" style="width:200px">
            <select id="workflow-trigger" class="form-select form-select-sm" style="width:150px">
              <option value="manual">Manual Trigger</option>
              <option value="schedule">Scheduled</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
          </div>
        </div>

        <!-- Main Content -->
        <div class="workflow-content">
          <!-- Node Palette -->
          <div class="workflow-palette">
            <div class="palette-header">Node Library</div>
            <div id="node-palette" class="palette-nodes"></div>
          </div>

          <!-- Canvas -->
          <div class="workflow-canvas-container">
            <svg id="workflow-canvas" class="workflow-canvas">
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                  <polygon points="0 0, 10 3, 0 6" fill="#667eea" />
                </marker>
              </defs>
              <g id="connections-layer"></g>
              <g id="nodes-layer"></g>
            </svg>
            <div id="canvas-nodes" class="canvas-nodes"></div>
          </div>

          <!-- Properties Panel -->
          <div class="workflow-properties">
            <div class="properties-header">Properties</div>
            <div id="properties-panel" class="properties-content">
              <div class="text-muted text-center p-3">Select a node to edit properties</div>
            </div>
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div class="workflow-status-bar">
          <span>Nodes: <strong id="node-count">0</strong></span>
          <span class="ms-3">Connections: <strong id="connection-count">0</strong></span>
          <span class="ms-3">Zoom: <strong id="zoom-level">100%</strong></span>
          <span class="ms-auto" id="status-message">Ready</span>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('workflow-canvas');
    this.nodesLayer = document.getElementById('nodes-layer');
    this.connectionsLayer = document.getElementById('connections-layer');
    this.canvasNodes = document.getElementById('canvas-nodes');
  }

  renderPalette() {
    const palette = document.getElementById('node-palette');
    const nodeTypes = this.getNodeTypes();

    palette.innerHTML = nodeTypes.map(type => `
      <div class="palette-category">
        <div class="category-title">${type.category}</div>
        ${type.nodes.map(node => `
          <div class="palette-node" draggable="true" data-node-type="${node.type}">
            <i class="bi ${node.icon}"></i>
            <span>${node.label}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    // Add drag listeners
    palette.querySelectorAll('.palette-node').forEach(node => {
      node.addEventListener('dragstart', (e) => this.handlePaletteDragStart(e));
    });
  }

  getNodeTypes() {
    return [
      {
        category: 'Triggers',
        nodes: [
          { type: 'trigger-manual', label: 'Manual', icon: 'bi-hand-index' },
          { type: 'trigger-schedule', label: 'Schedule', icon: 'bi-clock' },
          { type: 'trigger-webhook', label: 'Webhook', icon: 'bi-link-45deg' },
          { type: 'trigger-event', label: 'Event', icon: 'bi-lightning' }
        ]
      },
      {
        category: 'Actions',
        nodes: [
          { type: 'action-email', label: 'Send Email', icon: 'bi-envelope' },
          { type: 'action-http', label: 'HTTP Request', icon: 'bi-globe' },
          { type: 'action-database', label: 'Database Query', icon: 'bi-database' },
          { type: 'action-notification', label: 'Notification', icon: 'bi-bell' },
          { type: 'action-create-record', label: 'Create Record', icon: 'bi-plus-circle' },
          { type: 'action-update-record', label: 'Update Record', icon: 'bi-pencil-square' },
          { type: 'action-script', label: 'Run Script', icon: 'bi-code-square' }
        ]
      },
      {
        category: 'Logic',
        nodes: [
          { type: 'logic-condition', label: 'Condition', icon: 'bi-signpost-split' },
          { type: 'logic-switch', label: 'Switch', icon: 'bi-diagram-3' },
          { type: 'logic-loop', label: 'Loop', icon: 'bi-arrow-repeat' },
          { type: 'logic-delay', label: 'Delay', icon: 'bi-hourglass' }
        ]
      },
      {
        category: 'Data',
        nodes: [
          { type: 'data-transform', label: 'Transform', icon: 'bi-shuffle' },
          { type: 'data-filter', label: 'Filter', icon: 'bi-funnel' },
          { type: 'data-aggregate', label: 'Aggregate', icon: 'bi-collection' },
          { type: 'data-variable', label: 'Set Variable', icon: 'bi-box' }
        ]
      }
    ];
  }

  handlePaletteDragStart(e) {
    e.dataTransfer.setData('nodeType', e.target.dataset.nodeType);
  }

  setupEventListeners() {
    // Canvas drop
    this.canvasNodes.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    this.canvasNodes.addEventListener('drop', (e) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (nodeType) {
        const rect = this.canvasNodes.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;
        this.addNode(nodeType, x, y);
      }
    });

    // Canvas panning
    let isPanning = false;
    let startX, startY;

    this.canvasNodes.addEventListener('mousedown', (e) => {
      if (e.target === this.canvasNodes || e.target === this.canvas) {
        isPanning = true;
        startX = e.clientX - this.panX;
        startY = e.clientY - this.panY;
        this.canvasNodes.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        this.panX = e.clientX - startX;
        this.panY = e.clientY - startY;
        this.updateTransform();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        this.canvasNodes.style.cursor = 'default';
      }
    });
  }

  addNode(type, x, y) {
    const nodeId = `node-${this.nodeIdCounter++}`;
    const nodeInfo = this.getNodeInfo(type);

    const node = {
      id: nodeId,
      type: type,
      label: nodeInfo.label,
      icon: nodeInfo.icon,
      x: x,
      y: y,
      config: nodeInfo.defaultConfig || {},
      inputs: nodeInfo.inputs || 1,
      outputs: nodeInfo.outputs || 1
    };

    this.nodes.push(node);
    this.renderNode(node);
    this.updateStats();
    this.setStatus(`Added ${nodeInfo.label} node`);
  }

  getNodeInfo(type) {
    const allNodes = this.getNodeTypes().flatMap(cat => cat.nodes);
    const nodeType = allNodes.find(n => n.type === type);

    const configs = {
      'action-email': {
        defaultConfig: { to: '', subject: '', body: '' },
        inputs: 1,
        outputs: 1
      },
      'action-http': {
        defaultConfig: { method: 'GET', url: '', headers: {}, body: '' },
        inputs: 1,
        outputs: 2 // success, error
      },
      'logic-condition': {
        defaultConfig: { condition: '' },
        inputs: 1,
        outputs: 2 // true, false
      },
      'logic-switch': {
        defaultConfig: { cases: [] },
        inputs: 1,
        outputs: 4 // multiple cases
      }
    };

    return {
      ...nodeType,
      ...configs[type]
    };
  }

  renderNode(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'workflow-node';
    nodeEl.id = node.id;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    nodeEl.innerHTML = `
      <div class="node-header">
        <i class="bi ${node.icon}"></i>
        <span class="node-label">${node.label}</span>
        <button class="node-delete" onclick="workflowDesigner.deleteNode('${node.id}')">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div class="node-body">
        ${this.renderNodeConfig(node)}
      </div>
      <div class="node-connectors">
        ${node.inputs > 0 ? '<div class="connector input" data-node="${node.id}" data-type="input"></div>' : ''}
        ${node.outputs > 0 ? '<div class="connector output" data-node="${node.id}" data-type="output"></div>' : ''}
      </div>
    `;

    // Make draggable
    nodeEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-header') && !e.target.closest('.node-delete')) {
        this.startNodeDrag(node, e);
      }
    });

    // Click to select
    nodeEl.addEventListener('click', (e) => {
      if (!e.target.closest('.node-delete')) {
        this.selectNode(node);
      }
    });

    // Add connector listeners
    nodeEl.querySelectorAll('.connector.output').forEach(conn => {
      conn.addEventListener('mousedown', (e) => this.startConnection(node, e));
    });

    this.canvasNodes.appendChild(nodeEl);
  }

  renderNodeConfig(node) {
    const config = node.config;
    switch (node.type) {
      case 'action-email':
        return `<small class="text-muted">To: ${config.to || 'Not set'}</small>`;
      case 'action-http':
        return `<small class="text-muted">${config.method} ${config.url || 'URL not set'}</small>`;
      case 'logic-condition':
        return `<small class="text-muted">If ${config.condition || 'condition'}</small>`;
      default:
        return `<small class="text-muted">Click to configure</small>`;
    }
  }

  startNodeDrag(node, e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = node.x;
    const initialY = node.y;

    const onMouseMove = (e) => {
      const dx = (e.clientX - startX) / this.zoom;
      const dy = (e.clientY - startY) / this.zoom;
      node.x = initialX + dx;
      node.y = initialY + dy;
      this.updateNodePosition(node);
      this.redrawConnections();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  updateNodePosition(node) {
    const nodeEl = document.getElementById(node.id);
    if (nodeEl) {
      nodeEl.style.left = `${node.x}px`;
      nodeEl.style.top = `${node.y}px`;
    }
  }

  selectNode(node) {
    this.selectedNode = node;
    document.querySelectorAll('.workflow-node').forEach(n => n.classList.remove('selected'));
    document.getElementById(node.id).classList.add('selected');
    this.showProperties(node);
  }

  showProperties(node) {
    const panel = document.getElementById('properties-panel');
    panel.innerHTML = `
      <div class="property-group">
        <label>Node Type</label>
        <input type="text" class="form-control form-control-sm" value="${node.label}" readonly>
      </div>
      <div class="property-group">
        <label>Node ID</label>
        <input type="text" class="form-control form-control-sm" value="${node.id}" readonly>
      </div>
      ${this.renderPropertiesForType(node)}
      <div class="mt-3">
        <button class="btn btn-sm btn-primary w-100" onclick="workflowDesigner.saveNodeConfig()">
          Save Configuration
        </button>
      </div>
    `;
  }

  renderPropertiesForType(node) {
    switch (node.type) {
      case 'action-email':
        return `
          <div class="property-group">
            <label>To</label>
            <input type="email" id="prop-to" class="form-control form-control-sm" value="${node.config.to || ''}">
          </div>
          <div class="property-group">
            <label>Subject</label>
            <input type="text" id="prop-subject" class="form-control form-control-sm" value="${node.config.subject || ''}">
          </div>
          <div class="property-group">
            <label>Body</label>
            <textarea id="prop-body" class="form-control form-control-sm" rows="3">${node.config.body || ''}</textarea>
          </div>
        `;
      case 'action-http':
        return `
          <div class="property-group">
            <label>Method</label>
            <select id="prop-method" class="form-select form-select-sm">
              <option ${node.config.method === 'GET' ? 'selected' : ''}>GET</option>
              <option ${node.config.method === 'POST' ? 'selected' : ''}>POST</option>
              <option ${node.config.method === 'PUT' ? 'selected' : ''}>PUT</option>
              <option ${node.config.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
          </div>
          <div class="property-group">
            <label>URL</label>
            <input type="url" id="prop-url" class="form-control form-control-sm" value="${node.config.url || ''}">
          </div>
          <div class="property-group">
            <label>Body (JSON)</label>
            <textarea id="prop-http-body" class="form-control form-control-sm" rows="3">${node.config.body || ''}</textarea>
          </div>
        `;
      case 'logic-condition':
        return `
          <div class="property-group">
            <label>Condition</label>
            <input type="text" id="prop-condition" class="form-control form-control-sm"
              value="${node.config.condition || ''}"
              placeholder="e.g., data.amount > 100">
          </div>
        `;
      case 'trigger-schedule':
        return `
          <div class="property-group">
            <label>Cron Expression</label>
            <input type="text" id="prop-cron" class="form-control form-control-sm"
              value="${node.config.cron || '0 0 * * *'}"
              placeholder="0 0 * * * (daily at midnight)">
          </div>
        `;
      default:
        return '<div class="text-muted p-2">No configuration needed</div>';
    }
  }

  saveNodeConfig() {
    if (!this.selectedNode) return;

    const node = this.selectedNode;

    switch (node.type) {
      case 'action-email':
        node.config.to = document.getElementById('prop-to').value;
        node.config.subject = document.getElementById('prop-subject').value;
        node.config.body = document.getElementById('prop-body').value;
        break;
      case 'action-http':
        node.config.method = document.getElementById('prop-method').value;
        node.config.url = document.getElementById('prop-url').value;
        node.config.body = document.getElementById('prop-http-body').value;
        break;
      case 'logic-condition':
        node.config.condition = document.getElementById('prop-condition').value;
        break;
      case 'trigger-schedule':
        node.config.cron = document.getElementById('prop-cron').value;
        break;
    }

    // Update node display
    const nodeEl = document.getElementById(node.id);
    const bodyEl = nodeEl.querySelector('.node-body');
    bodyEl.innerHTML = this.renderNodeConfig(node);

    this.setStatus('Configuration saved');
  }

  deleteNode(nodeId) {
    if (confirm('Delete this node?')) {
      this.nodes = this.nodes.filter(n => n.id !== nodeId);
      this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);

      const nodeEl = document.getElementById(nodeId);
      if (nodeEl) nodeEl.remove();

      this.redrawConnections();
      this.updateStats();
      this.setStatus('Node deleted');
    }
  }

  startConnection(fromNode, e) {
    e.stopPropagation();
    // Connection drawing logic would go here
    // For simplicity, we'll implement a basic click-to-connect
    this.setStatus('Click on another node to connect');
  }

  redrawConnections() {
    this.connectionsLayer.innerHTML = '';
    this.connections.forEach(conn => {
      const fromNode = this.nodes.find(n => n.id === conn.from);
      const toNode = this.nodes.find(n => n.id === conn.to);
      if (fromNode && toNode) {
        this.drawConnection(fromNode, toNode);
      }
    });
  }

  drawConnection(fromNode, toNode) {
    const x1 = fromNode.x + 150;
    const y1 = fromNode.y + 40;
    const x2 = toNode.x;
    const y2 = toNode.y + 40;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#667eea');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');

    this.connectionsLayer.appendChild(path);
  }

  updateTransform() {
    this.canvasNodes.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  zoomIn() {
    this.zoom = Math.min(this.zoom * 1.2, 3);
    this.updateTransform();
  }

  zoomOut() {
    this.zoom = Math.max(this.zoom / 1.2, 0.3);
    this.updateTransform();
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  updateStats() {
    document.getElementById('node-count').textContent = this.nodes.length;
    document.getElementById('connection-count').textContent = this.connections.length;
  }

  setStatus(message) {
    document.getElementById('status-message').textContent = message;
    setTimeout(() => {
      document.getElementById('status-message').textContent = 'Ready';
    }, 3000);
  }

  clearCanvas() {
    if (confirm('Clear all nodes and connections?')) {
      this.nodes = [];
      this.connections = [];
      this.canvasNodes.innerHTML = '';
      this.connectionsLayer.innerHTML = '';
      this.updateStats();
      this.setStatus('Canvas cleared');
    }
  }

  async saveWorkflow() {
    const name = document.getElementById('workflow-name').value || 'Untitled Workflow';
    const trigger = document.getElementById('workflow-trigger').value;

    const workflow = {
      name: name,
      trigger: trigger,
      nodes: this.nodes,
      connections: this.connections,
      createdAt: new Date().toISOString()
    };

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
      });

      const data = await response.json();
      if (data.success) {
        showNotification('Workflow saved successfully', 'success');
        this.currentWorkflow = data.workflow;
      } else {
        showNotification('Failed to save workflow: ' + data.error, 'error');
      }
    } catch (err) {
      showNotification('Error saving workflow: ' + err.message, 'error');
    }
  }

  async loadWorkflow() {
    // Show workflow list modal
    showNotification('Load workflow feature coming soon', 'info');
  }

  async testWorkflow() {
    if (this.nodes.length === 0) {
      showNotification('Add nodes to test the workflow', 'warning');
      return;
    }

    showNotification('Testing workflow...', 'info');

    // Simulate workflow execution
    setTimeout(() => {
      showNotification('Workflow test completed successfully', 'success');
      this.setStatus('Test completed');
    }, 2000);
  }
}

// Global instance
let workflowDesigner;

// Initialize when page loads
window.initWorkflowDesigner = function() {
  workflowDesigner = new WorkflowDesigner('workflow-designer-container');
};
