/**
 * Process Designer - BPMN 2.0 Visual Process Designer
 * Integrates with exprsn-workflow and exprsn-forge CRM
 */

class ProcessDesigner {
  constructor(options) {
    this.applicationId = options.applicationId;
    this.processId = options.processId;
    this.processData = options.processData || {};
    this.canvasElement = options.canvasElement;
    this.propertiesElement = options.propertiesElement;

    // Process state
    this.elements = new Map(); // id -> element object
    this.connections = new Map(); // id -> connection object
    this.selectedElement = null;
    this.selectedConnection = null;
    this.draggedElement = null;
    this.connectionMode = false;
    this.connectionSource = null;
    this.tempConnection = null;
    this.isDrawingConnection = false;
    this.zoom = 1.0;
    this.panOffset = { x: 0, y: 0 };

    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;

    // Integration data
    this.workflows = [];
    this.crmEntities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Case', 'Task'];

    // Monaco editor for BPMN XML
    this.xmlEditor = null;

    // Initialize
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupCanvas();
    await this.loadWorkflows();
    await this.loadProcess();
    this.initializeMonacoEditor();
    this.saveSnapshot(); // Initial state
  }

  setupEventListeners() {
    // Toolbox drag and drop
    const toolboxElements = document.querySelectorAll('.bpmn-element');
    toolboxElements.forEach(el => {
      el.addEventListener('dragstart', (e) => this.handleDragStart(e));
      el.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });

    // Canvas drop
    this.canvasElement.addEventListener('dragover', (e) => e.preventDefault());
    this.canvasElement.addEventListener('drop', (e) => this.handleDrop(e));
    this.canvasElement.addEventListener('click', (e) => this.handleCanvasClick(e));

    // Header buttons
    document.getElementById('save-btn').addEventListener('click', () => this.saveProcess());
    document.getElementById('activate-btn').addEventListener('click', () => this.activateProcess());
    document.getElementById('validate-btn').addEventListener('click', () => this.validateProcess());
    document.getElementById('test-btn').addEventListener('click', () => this.testProcess());
    document.getElementById('undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('redo-btn').addEventListener('click', () => this.redo());

    // Canvas toolbar
    document.getElementById('connection-mode-btn').addEventListener('click', () => this.toggleConnectionMode());
    document.getElementById('zoom-in-btn').addEventListener('click', () => this.zoomIn());
    document.getElementById('zoom-out-btn').addEventListener('click', () => this.zoomOut());
    document.getElementById('fit-view-btn').addEventListener('click', () => this.fitToView());
    document.getElementById('auto-layout-btn').addEventListener('click', () => this.autoLayout());
    document.getElementById('copy-xml-btn').addEventListener('click', () => this.copyXML());

    // Properties tabs
    document.querySelectorAll('.properties-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.properties-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.updatePropertiesPanel();
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  setupCanvas() {
    const svg = this.canvasElement;

    // Add defs for markers (arrowheads)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#475569" />
      </marker>
    `;
    svg.appendChild(defs);

    // Create main group for pan/zoom
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.mainGroup.setAttribute('id', 'main-group');
    svg.appendChild(this.mainGroup);

    // Pan and zoom
    let isPanning = false;
    let startPan = { x: 0, y: 0 };

    svg.addEventListener('mousedown', (e) => {
      if (e.target === svg || e.target === this.mainGroup) {
        isPanning = true;
        startPan = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
        svg.style.cursor = 'grabbing';
      }
    });

    svg.addEventListener('mousemove', (e) => {
      if (isPanning) {
        this.panOffset.x = e.clientX - startPan.x;
        this.panOffset.y = e.clientY - startPan.y;
        this.updateTransform();
      } else if (this.isDrawingConnection) {
        this.updateTempConnection(e.clientX, e.clientY);
      }
    });

    svg.addEventListener('mouseup', () => {
      isPanning = false;
      svg.style.cursor = 'default';
    });

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom *= delta;
      this.zoom = Math.max(0.1, Math.min(3, this.zoom));
      this.updateTransform();
    });
  }

  updateTransform() {
    this.mainGroup.setAttribute('transform',
      `translate(${this.panOffset.x}, ${this.panOffset.y}) scale(${this.zoom})`
    );
  }

  /**
   * Toggle connection mode
   */
  toggleConnectionMode() {
    this.connectionMode = !this.connectionMode;
    const btn = document.getElementById('connection-mode-btn');

    if (this.connectionMode) {
      btn.style.background = 'var(--primary-color)';
      btn.style.color = 'white';
      this.canvasElement.style.cursor = 'crosshair';
      this.showNotification('Connection mode active. Click elements to connect.', 'info');
    } else {
      btn.style.background = '';
      btn.style.color = '';
      this.canvasElement.style.cursor = 'default';
      this.cancelConnection();
    }
  }

  /**
   * Start connection from an element
   */
  startConnection(elementId) {
    if (!this.connectionMode) return;

    this.connectionSource = elementId;
    const element = this.elements.get(elementId);

    // Create temporary connection line
    this.tempConnection = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    this.tempConnection.setAttribute('x1', element.x);
    this.tempConnection.setAttribute('y1', element.y);
    this.tempConnection.setAttribute('x2', element.x);
    this.tempConnection.setAttribute('y2', element.y);
    this.tempConnection.setAttribute('stroke', '#3b82f6');
    this.tempConnection.setAttribute('stroke-width', '2');
    this.tempConnection.setAttribute('stroke-dasharray', '5,5');
    this.tempConnection.setAttribute('marker-end', 'url(#arrowhead)');
    this.mainGroup.appendChild(this.tempConnection);

    // Track mouse movement
    this.isDrawingConnection = true;

    // Highlight source element
    const sourceGroup = document.getElementById(elementId);
    if (sourceGroup) {
      const shape = sourceGroup.querySelector('circle, rect, polygon');
      if (shape) {
        shape.setAttribute('stroke', '#3b82f6');
        shape.setAttribute('stroke-width', '3');
      }
    }
  }

  /**
   * Update temporary connection line during mouse move
   */
  updateTempConnection(x, y) {
    if (!this.tempConnection) return;

    const rect = this.canvasElement.getBoundingClientRect();
    const canvasX = (x - rect.left - this.panOffset.x) / this.zoom;
    const canvasY = (y - rect.top - this.panOffset.y) / this.zoom;

    this.tempConnection.setAttribute('x2', canvasX);
    this.tempConnection.setAttribute('y2', canvasY);
  }

  /**
   * Complete connection to target element
   */
  completeConnection(targetElementId) {
    if (!this.connectionMode || !this.connectionSource) return;

    if (this.connectionSource === targetElementId) {
      this.showNotification('Cannot connect element to itself', 'error');
      this.cancelConnection();
      return;
    }

    // Check if connection already exists
    const exists = Array.from(this.connections.values()).some(
      conn => conn.sourceId === this.connectionSource && conn.targetId === targetElementId
    );

    if (exists) {
      this.showNotification('Connection already exists', 'error');
      this.cancelConnection();
      return;
    }

    // Create connection
    this.createConnection(this.connectionSource, targetElementId);
    this.cancelConnection();
    this.saveSnapshot();
    this.showNotification('Connection created', 'success');
  }

  /**
   * Cancel connection drawing
   */
  cancelConnection() {
    if (this.tempConnection) {
      this.tempConnection.remove();
      this.tempConnection = null;
    }

    // Unhighlight source element
    if (this.connectionSource) {
      const sourceGroup = document.getElementById(this.connectionSource);
      if (sourceGroup) {
        const shape = sourceGroup.querySelector('circle, rect, polygon');
        if (shape) {
          const originalWidth = shape.getAttribute('stroke-width');
          shape.setAttribute('stroke-width', originalWidth === '4' ? '4' : '2');
        }
      }
    }

    this.connectionSource = null;
    this.isDrawingConnection = false;
  }

  /**
   * Create a connection between two elements
   */
  createConnection(sourceId, targetId) {
    const id = 'conn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const connection = {
      id,
      sourceId,
      targetId,
      label: '',
      condition: '',
      isDefault: false
    };

    this.connections.set(id, connection);
    this.renderConnection(connection);
    this.updateBPMNXML();
  }

  /**
   * Render a connection as SVG line
   */
  renderConnection(connection) {
    const source = this.elements.get(connection.sourceId);
    const target = this.elements.get(connection.targetId);

    if (!source || !target) return;

    // Create connection group
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', connection.id);
    group.setAttribute('class', 'connection-group');
    group.style.cursor = 'pointer';

    // Create line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', source.x);
    line.setAttribute('y1', source.y);
    line.setAttribute('x2', target.x);
    line.setAttribute('y2', target.y);
    line.setAttribute('stroke', '#475569');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    group.appendChild(line);

    // Add label if present
    if (connection.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      text.setAttribute('x', midX);
      text.setAttribute('y', midY - 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#475569');
      text.textContent = connection.label;
      group.appendChild(text);
    }

    // Make clickable
    group.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectConnection(connection.id);
    });

    // Insert before elements so connections appear behind
    this.mainGroup.insertBefore(group, this.mainGroup.firstChild);
  }

  /**
   * Select a connection
   */
  selectConnection(connectionId) {
    // Deselect elements
    this.selectedElement = null;

    // Highlight connection
    document.querySelectorAll('.connection-group line').forEach(line => {
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke', '#475569');
    });

    const connGroup = document.getElementById(connectionId);
    if (connGroup) {
      const line = connGroup.querySelector('line');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke', '#3b82f6');
    }

    this.selectedConnection = connectionId;
    this.updateConnectionProperties();
  }

  /**
   * Update connection properties panel
   */
  updateConnectionProperties() {
    if (!this.selectedConnection) return;

    const connection = this.connections.get(this.selectedConnection);
    if (!connection) return;

    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">Connection Properties</div>

        <div class="property-field">
          <label class="property-label">Connection ID</label>
          <input type="text" class="property-input" value="${connection.id}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Source Element</label>
          <input type="text" class="property-input" value="${connection.sourceId}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Target Element</label>
          <input type="text" class="property-input" value="${connection.targetId}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Label</label>
          <input type="text" class="property-input" id="conn-label" value="${connection.label || ''}" placeholder="Optional label">
        </div>

        <div class="property-field">
          <label class="property-label">Condition</label>
          <input type="text" class="property-input" id="conn-condition" value="${connection.condition || ''}" placeholder="\${variable} == 'value'">
          <div class="property-hint">Expression for conditional flow (gateway paths)</div>
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="conn-default" ${connection.isDefault ? 'checked' : ''}> Default Flow
          </label>
          <div class="property-hint">Taken if no other conditions match</div>
        </div>
      </div>

      <div class="property-group">
        <button class="btn btn-secondary" style="width: 100%; background: #fee2e2; color: #991b1b;" onclick="window.processDesigner.deleteConnection()">
          <i class="fas fa-trash"></i> Delete Connection
        </button>
      </div>
    `;

    // Add event listeners
    document.getElementById('conn-label')?.addEventListener('change', (e) => {
      connection.label = e.target.value;
      this.redrawConnection(connection);
      this.saveSnapshot();
    });

    document.getElementById('conn-condition')?.addEventListener('change', (e) => {
      connection.condition = e.target.value;
      this.saveSnapshot();
    });

    document.getElementById('conn-default')?.addEventListener('change', (e) => {
      connection.isDefault = e.target.checked;
      this.saveSnapshot();
    });
  }

  /**
   * Delete selected connection
   */
  deleteConnection() {
    if (!this.selectedConnection) return;

    if (!confirm('Delete this connection?')) return;

    const connGroup = document.getElementById(this.selectedConnection);
    if (connGroup) connGroup.remove();

    this.connections.delete(this.selectedConnection);
    this.selectedConnection = null;
    this.updatePropertiesPanel();
    this.saveSnapshot();
    this.updateBPMNXML();
    this.showNotification('Connection deleted', 'success');
  }

  /**
   * Redraw connection (after label change)
   */
  redrawConnection(connection) {
    const connGroup = document.getElementById(connection.id);
    if (connGroup) connGroup.remove();
    this.renderConnection(connection);
  }

  handleDragStart(e) {
    this.draggedElement = e.target.closest('.bpmn-element').dataset.type;
    e.dataTransfer.effectAllowed = 'copy';
  }

  handleDragEnd(e) {
    this.draggedElement = null;
  }

  handleDrop(e) {
    e.preventDefault();
    if (!this.draggedElement) return;

    const rect = this.canvasElement.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.panOffset.x) / this.zoom;
    const y = (e.clientY - rect.top - this.panOffset.y) / this.zoom;

    this.addElement(this.draggedElement, x, y);
    this.draggedElement = null;
    this.saveSnapshot();
  }

  addElement(type, x, y) {
    const id = 'element-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const element = {
      id,
      type,
      x,
      y,
      name: this.getDefaultName(type),
      properties: this.getDefaultProperties(type)
    };

    this.elements.set(id, element);
    this.renderElement(element);
    return element;
  }

  getDefaultName(type) {
    const names = {
      'start-event': 'Start',
      'end-event': 'End',
      'timer-event': 'Timer',
      'user-task': 'User Task',
      'service-task': 'Service Task',
      'workflow-task': 'Workflow Task',
      'crm-task': 'CRM Task',
      'script-task': 'Script Task',
      'exclusive-gateway': 'Decision',
      'parallel-gateway': 'Parallel Split',
      // Timeline
      'timeline-post': 'Create Post',
      'timeline-comment': 'Add Comment',
      'timeline-like': 'Like/React',
      // Auth
      'auth-login': 'User Login',
      'auth-register': 'User Registration',
      'auth-mfa': 'MFA Challenge',
      'auth-permission': 'Check Permission',
      // Spark
      'spark-message': 'Send Message',
      'spark-broadcast': 'Broadcast Message',
      // Herald
      'herald-email': 'Send Email',
      'herald-sms': 'Send SMS',
      'herald-push': 'Push Notification',
      // Bridge
      'bridge-api': 'API Call',
      'bridge-webhook': 'Webhook',
      // Nexus
      'nexus-group': 'Manage Group',
      'nexus-event': 'Create Event',
      // FileVault
      'filevault-upload': 'Upload File',
      'filevault-download': 'Download File',
      // Payments
      'payment-charge': 'Process Payment',
      'payment-refund': 'Issue Refund'
    };
    return names[type] || type;
  }

  getDefaultProperties(type) {
    const props = {
      description: '',
      documentation: ''
    };

    // Base properties for existing types
    if (type === 'workflow-task') {
      props.workflowId = null;
      props.inputMapping = {};
      props.outputMapping = {};
    } else if (type === 'crm-task') {
      props.crmEntity = 'Contact';
      props.crmOperation = 'create';
      props.fieldMapping = {};
    } else if (type === 'script-task') {
      props.script = '// JavaScript code\nreturn { success: true };';
      props.timeout = 30000;
    } else if (type === 'user-task') {
      props.assignee = '';
      props.candidateGroups = [];
      props.formKey = null;
      props.dueDate = null;
    } else if (type === 'timer-event') {
      props.timerType = 'duration';
      props.timerValue = 'PT1H';
    } else if (type.includes('gateway')) {
      props.defaultFlow = null;
    }

    // Service-specific properties (from EnhancedPropertyManager)
    if (typeof EnhancedPropertyManager !== 'undefined') {
      const serviceProps = EnhancedPropertyManager.getServiceDefaultProperties(type);
      Object.assign(props, serviceProps);
    }

    return props;
  }

  renderElement(element) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', element.id);
    group.setAttribute('class', 'bpmn-element-group');
    group.setAttribute('transform', `translate(${element.x}, ${element.y})`);
    group.style.cursor = 'move';

    // Render based on type
    if (element.type.includes('event')) {
      this.renderEvent(group, element);
    } else if (element.type.includes('task')) {
      this.renderTask(group, element);
    } else if (element.type.includes('gateway')) {
      this.renderGateway(group, element);
    }

    // Add label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '60');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '12');
    text.setAttribute('fill', '#334155');
    text.textContent = element.name;
    group.appendChild(text);

    // Make draggable
    this.makeElementDraggable(group, element);

    // Make clickable
    group.addEventListener('click', (e) => {
      e.stopPropagation();

      // Handle connection mode
      if (this.connectionMode) {
        if (!this.connectionSource) {
          this.startConnection(element.id);
        } else {
          this.completeConnection(element.id);
        }
      } else {
        this.selectElement(element.id);
      }
    });

    this.mainGroup.appendChild(group);
  }

  renderEvent(group, element) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '20');
    circle.setAttribute('fill', element.type === 'start-event' ? '#dbeafe' :
                                 element.type === 'end-event' ? '#fee2e2' : '#fef3c7');
    circle.setAttribute('stroke', element.type === 'start-event' ? '#1e40af' :
                                  element.type === 'end-event' ? '#991b1b' : '#92400e');
    circle.setAttribute('stroke-width', element.type === 'end-event' ? '3' : '2');
    group.appendChild(circle);

    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '0');
    icon.setAttribute('y', '6');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-family', 'FontAwesome');
    icon.setAttribute('font-size', '14');
    icon.setAttribute('fill', element.type === 'start-event' ? '#1e40af' :
                             element.type === 'end-event' ? '#991b1b' : '#92400e');
    icon.textContent = element.type === 'start-event' ? '\uf04b' :
                      element.type === 'end-event' ? '\uf11e' : '\uf017';
    group.appendChild(icon);
  }

  renderTask(group, element) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-50');
    rect.setAttribute('y', '-25');
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '50');
    rect.setAttribute('rx', '5');
    rect.setAttribute('fill', '#fef3c7');
    rect.setAttribute('stroke', '#92400e');
    rect.setAttribute('stroke-width', '2');
    group.appendChild(rect);

    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '-40');
    icon.setAttribute('y', '5');
    icon.setAttribute('font-family', 'FontAwesome');
    icon.setAttribute('font-size', '14');
    icon.setAttribute('fill', '#92400e');

    const iconMap = {
      'user-task': '\uf007',
      'service-task': '\uf013',
      'workflow-task': '\uf542',
      'crm-task': '\uf2bb',
      'script-task': '\uf121'
    };
    icon.textContent = iconMap[element.type] || '\uf013';
    group.appendChild(icon);

    // Task name (shortened)
    const taskText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    taskText.setAttribute('x', '0');
    taskText.setAttribute('y', '5');
    taskText.setAttribute('text-anchor', 'middle');
    taskText.setAttribute('font-size', '11');
    taskText.setAttribute('fill', '#334155');
    taskText.textContent = element.name.length > 12 ? element.name.substr(0, 12) + '...' : element.name;
    group.appendChild(taskText);
  }

  renderGateway(group, element) {
    const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    diamond.setAttribute('points', '0,-30 30,0 0,30 -30,0');
    diamond.setAttribute('fill', '#e0e7ff');
    diamond.setAttribute('stroke', '#4338ca');
    diamond.setAttribute('stroke-width', '2');
    group.appendChild(diamond);

    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '0');
    icon.setAttribute('y', '6');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-family', 'FontAwesome');
    icon.setAttribute('font-size', '14');
    icon.setAttribute('fill', '#4338ca');
    icon.textContent = element.type === 'exclusive-gateway' ? '\uf126' : '\uf067';
    group.appendChild(icon);
  }

  makeElementDraggable(group, element) {
    let isDragging = false;
    let startPos = { x: 0, y: 0 };

    group.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        isDragging = true;
        const rect = this.canvasElement.getBoundingClientRect();
        startPos = {
          x: (e.clientX - rect.left - this.panOffset.x) / this.zoom - element.x,
          y: (e.clientY - rect.top - this.panOffset.y) / this.zoom - element.y
        };
        e.stopPropagation();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const rect = this.canvasElement.getBoundingClientRect();
        element.x = (e.clientX - rect.left - this.panOffset.x) / this.zoom - startPos.x;
        element.y = (e.clientY - rect.top - this.panOffset.y) / this.zoom - startPos.y;
        group.setAttribute('transform', `translate(${element.x}, ${element.y})`);
        this.updateConnections(element.id);
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.saveSnapshot();
      }
    });
  }

  selectElement(elementId) {
    // Deselect previous
    if (this.selectedElement) {
      const prevGroup = document.getElementById(this.selectedElement);
      if (prevGroup) {
        const shape = prevGroup.querySelector('circle, rect, polygon');
        if (shape) shape.setAttribute('stroke-width', shape.getAttribute('stroke-width') === '3' ? '3' : '2');
      }
    }

    // Deselect any selected connection
    this.selectedConnection = null;
    document.querySelectorAll('.connection-group line').forEach(line => {
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke', '#475569');
    });

    // Select new
    this.selectedElement = elementId;
    const group = document.getElementById(elementId);
    if (group) {
      const shape = group.querySelector('circle, rect, polygon');
      if (shape) shape.setAttribute('stroke-width', '4');
    }

    this.updatePropertiesPanel();
  }

  updatePropertiesPanel() {
    // Handle connection selection
    if (this.selectedConnection) {
      this.updateConnectionProperties();
      return;
    }

    if (!this.selectedElement) {
      this.propertiesElement.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-mouse-pointer"></i>
          <p>Select an element or connection on the canvas to view and edit its properties</p>
        </div>
      `;
      return;
    }

    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    const activeTab = document.querySelector('.properties-tab.active')?.dataset.tab || 'general';

    if (activeTab === 'general') {
      this.renderGeneralProperties(element);
    } else if (activeTab === 'integration') {
      this.renderIntegrationProperties(element);
    } else if (activeTab === 'data') {
      this.renderDataProperties(element);
    }
  }

  renderGeneralProperties(element) {
    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">Basic Information</div>

        <div class="property-field">
          <label class="property-label">Element ID</label>
          <input type="text" class="property-input" value="${element.id}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Element Type</label>
          <input type="text" class="property-input" value="${element.type}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Name</label>
          <input type="text" class="property-input" id="prop-name" value="${element.name}">
        </div>

        <div class="property-field">
          <label class="property-label">Description</label>
          <textarea class="property-textarea" id="prop-description">${element.properties.description || ''}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Documentation</label>
          <textarea class="property-textarea" id="prop-documentation">${element.properties.documentation || ''}</textarea>
        </div>
      </div>

      ${element.type === 'user-task' ? `
        <div class="property-group">
          <div class="property-group-title">User Task Settings</div>

          <div class="property-field">
            <label class="property-label">Assignee</label>
            <input type="text" class="property-input" id="prop-assignee" value="${element.properties.assignee || ''}" placeholder="User ID or expression">
            <div class="property-hint">User who will perform this task</div>
          </div>

          <div class="property-field">
            <label class="property-label">Due Date</label>
            <input type="text" class="property-input" id="prop-dueDate" value="${element.properties.dueDate || ''}" placeholder="ISO 8601 duration (e.g., PT2H)">
            <div class="property-hint">Time until task is due</div>
          </div>
        </div>
      ` : ''}

      ${element.type === 'timer-event' ? `
        <div class="property-group">
          <div class="property-group-title">Timer Settings</div>

          <div class="property-field">
            <label class="property-label">Timer Type</label>
            <select class="property-select" id="prop-timerType">
              <option value="duration" ${element.properties.timerType === 'duration' ? 'selected' : ''}>Duration</option>
              <option value="date" ${element.properties.timerType === 'date' ? 'selected' : ''}>Date</option>
              <option value="cycle" ${element.properties.timerType === 'cycle' ? 'selected' : ''}>Cycle</option>
            </select>
          </div>

          <div class="property-field">
            <label class="property-label">Timer Value</label>
            <input type="text" class="property-input" id="prop-timerValue" value="${element.properties.timerValue || 'PT1H'}" placeholder="PT1H">
            <div class="property-hint">ISO 8601 duration (e.g., PT1H for 1 hour)</div>
          </div>
        </div>
      ` : ''}

      <div class="property-group">
        <button class="btn btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="window.processDesigner.duplicateElement()">
          <i class="fas fa-copy"></i> Duplicate
        </button>
        <button class="btn btn-secondary" style="width: 100%; background: #fee2e2; color: #991b1b;" onclick="window.processDesigner.deleteElement()">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    `;

    // Add event listeners
    document.getElementById('prop-name')?.addEventListener('change', (e) => {
      element.name = e.target.value;
      this.updateElementLabel(element);
      this.saveSnapshot();
    });

    document.getElementById('prop-description')?.addEventListener('change', (e) => {
      element.properties.description = e.target.value;
      this.saveSnapshot();
    });

    document.getElementById('prop-documentation')?.addEventListener('change', (e) => {
      element.properties.documentation = e.target.value;
      this.saveSnapshot();
    });

    // Type-specific listeners
    if (element.type === 'user-task') {
      document.getElementById('prop-assignee')?.addEventListener('change', (e) => {
        element.properties.assignee = e.target.value;
        this.saveSnapshot();
      });
      document.getElementById('prop-dueDate')?.addEventListener('change', (e) => {
        element.properties.dueDate = e.target.value;
        this.saveSnapshot();
      });
    }

    if (element.type === 'timer-event') {
      document.getElementById('prop-timerType')?.addEventListener('change', (e) => {
        element.properties.timerType = e.target.value;
        this.saveSnapshot();
      });
      document.getElementById('prop-timerValue')?.addEventListener('change', (e) => {
        element.properties.timerValue = e.target.value;
        this.saveSnapshot();
      });
    }
  }

  renderIntegrationProperties(element) {
    // Try enhanced property manager first for service-specific tasks
    if (typeof EnhancedPropertyManager !== 'undefined' &&
        (element.type.startsWith('timeline-') ||
         element.type.startsWith('auth-') ||
         element.type.startsWith('spark-') ||
         element.type.startsWith('herald-') ||
         element.type.startsWith('bridge-') ||
         element.type.startsWith('nexus-') ||
         element.type.startsWith('filevault-') ||
         element.type.startsWith('payment-'))) {

      const html = EnhancedPropertyManager.renderServiceIntegrationProperties(element, this.propertiesElement);
      this.propertiesElement.innerHTML = html;
      this.attachServicePropertyListeners(element);

    } else if (element.type === 'workflow-task') {
      this.renderWorkflowIntegration(element);
    } else if (element.type === 'crm-task') {
      this.renderCRMIntegration(element);
    } else if (element.type === 'script-task') {
      this.renderScriptTask(element);
    } else {
      this.propertiesElement.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-puzzle-piece"></i>
          <p>This element type does not have integration options</p>
        </div>
      `;
    }
  }

  /**
   * Attach event listeners for service-specific properties
   */
  attachServicePropertyListeners(element) {
    // Generic handler for all property inputs
    const inputs = this.propertiesElement.querySelectorAll('.property-input, .property-select, .property-textarea');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const propName = e.target.id.replace('prop-', '');
        let value = e.target.value;

        // Parse JSON for certain fields
        if (propName === 'headers' || propName === 'body') {
          try {
            value = value ? JSON.parse(value) : (propName === 'headers' ? {} : null);
          } catch (err) {
            console.warn('Invalid JSON:', value);
            return;
          }
        }

        element.properties[propName] = value;
        this.saveSnapshot();
      });
    });

    // Checkbox handlers
    const checkboxes = this.propertiesElement.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const propName = e.target.id.replace('prop-', '');
        element.properties[propName] = e.target.checked;
        this.saveSnapshot();
      });
    });
  }

  renderWorkflowIntegration(element) {
    const workflowOptions = this.workflows.map(wf =>
      `<option value="${wf.id}" ${element.properties.workflowId === wf.id ? 'selected' : ''}>${wf.name}</option>`
    ).join('');

    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">Workflow Integration</div>

        <div class="property-field">
          <label class="property-label">Select Workflow</label>
          <select class="property-select" id="prop-workflowId">
            <option value="">-- Select Workflow --</option>
            ${workflowOptions}
          </select>
          <div class="property-hint">Workflow to execute in this task</div>
        </div>
      </div>

      <div class="property-group">
        <div class="property-group-title">Input Mapping</div>
        <div class="property-hint" style="margin-bottom: 0.75rem;">Map process variables to workflow inputs</div>
        <div id="input-mappings"></div>
        <button class="btn btn-secondary add-mapping-btn" onclick="window.processDesigner.addInputMapping()">
          <i class="fas fa-plus"></i> Add Input Mapping
        </button>
      </div>

      <div class="property-group">
        <div class="property-group-title">Output Mapping</div>
        <div class="property-hint" style="margin-bottom: 0.75rem;">Map workflow outputs to process variables</div>
        <div id="output-mappings"></div>
        <button class="btn btn-secondary add-mapping-btn" onclick="window.processDesigner.addOutputMapping()">
          <i class="fas fa-plus"></i> Add Output Mapping
        </button>
      </div>
    `;

    document.getElementById('prop-workflowId')?.addEventListener('change', (e) => {
      element.properties.workflowId = e.target.value;
      this.saveSnapshot();
    });

    this.renderMappings(element, 'input');
    this.renderMappings(element, 'output');
  }

  renderCRMIntegration(element) {
    const entityOptions = this.crmEntities.map(entity =>
      `<option value="${entity}" ${element.properties.crmEntity === entity ? 'selected' : ''}>${entity}</option>`
    ).join('');

    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">CRM Integration</div>

        <div class="property-field">
          <label class="property-label">CRM Entity</label>
          <select class="property-select" id="prop-crmEntity">
            ${entityOptions}
          </select>
        </div>

        <div class="property-field">
          <label class="property-label">Operation</label>
          <select class="property-select" id="prop-crmOperation">
            <option value="create" ${element.properties.crmOperation === 'create' ? 'selected' : ''}>Create Record</option>
            <option value="update" ${element.properties.crmOperation === 'update' ? 'selected' : ''}>Update Record</option>
            <option value="read" ${element.properties.crmOperation === 'read' ? 'selected' : ''}>Read Record</option>
            <option value="delete" ${element.properties.crmOperation === 'delete' ? 'selected' : ''}>Delete Record</option>
          </select>
        </div>
      </div>

      <div class="property-group">
        <div class="property-group-title">Field Mapping</div>
        <div class="property-hint" style="margin-bottom: 0.75rem;">Map process variables to CRM fields</div>
        <div id="field-mappings"></div>
        <button class="btn btn-secondary add-mapping-btn" onclick="window.processDesigner.addFieldMapping()">
          <i class="fas fa-plus"></i> Add Field Mapping
        </button>
      </div>
    `;

    document.getElementById('prop-crmEntity')?.addEventListener('change', (e) => {
      element.properties.crmEntity = e.target.value;
      this.saveSnapshot();
    });

    document.getElementById('prop-crmOperation')?.addEventListener('change', (e) => {
      element.properties.crmOperation = e.target.value;
      this.saveSnapshot();
    });

    this.renderFieldMappings(element);
  }

  renderScriptTask(element) {
    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">Script Configuration</div>

        <div class="property-field">
          <label class="property-label">JavaScript Code</label>
          <textarea class="property-textarea" id="prop-script" style="min-height: 200px; font-family: monospace;">${element.properties.script || ''}</textarea>
          <div class="property-hint">Return an object with results. Available: context, variables</div>
        </div>

        <div class="property-field">
          <label class="property-label">Timeout (ms)</label>
          <input type="number" class="property-input" id="prop-timeout" value="${element.properties.timeout || 30000}">
        </div>
      </div>
    `;

    document.getElementById('prop-script')?.addEventListener('change', (e) => {
      element.properties.script = e.target.value;
      this.saveSnapshot();
    });

    document.getElementById('prop-timeout')?.addEventListener('change', (e) => {
      element.properties.timeout = parseInt(e.target.value);
      this.saveSnapshot();
    });
  }

  renderDataProperties(element) {
    this.propertiesElement.innerHTML = `
      <div class="property-group">
        <div class="property-group-title">Position</div>

        <div class="property-field">
          <label class="property-label">X Position</label>
          <input type="number" class="property-input" value="${Math.round(element.x)}" readonly>
        </div>

        <div class="property-field">
          <label class="property-label">Y Position</label>
          <input type="number" class="property-input" value="${Math.round(element.y)}" readonly>
        </div>
      </div>

      <div class="property-group">
        <div class="property-group-title">Element Data (JSON)</div>
        <textarea class="property-textarea" readonly style="min-height: 200px; font-family: monospace;">${JSON.stringify(element, null, 2)}</textarea>
      </div>
    `;
  }

  renderMappings(element, type) {
    const mapping = type === 'input' ? element.properties.inputMapping : element.properties.outputMapping;
    const container = document.getElementById(`${type}-mappings`);
    if (!container) return;

    container.innerHTML = Object.entries(mapping || {}).map(([key, value]) => `
      <div class="mapping-item">
        <input type="text" class="property-input" value="${key}" placeholder="Variable name" readonly>
        <input type="text" class="property-input" value="${value}" placeholder="Workflow ${type}" readonly>
        <button onclick="window.processDesigner.removeMapping('${type}', '${key}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }

  renderFieldMappings(element) {
    const mapping = element.properties.fieldMapping || {};
    const container = document.getElementById('field-mappings');
    if (!container) return;

    container.innerHTML = Object.entries(mapping).map(([field, variable]) => `
      <div class="mapping-item">
        <input type="text" class="property-input" value="${field}" placeholder="CRM field" readonly>
        <input type="text" class="property-input" value="${variable}" placeholder="Process variable" readonly>
        <button onclick="window.processDesigner.removeFieldMapping('${field}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }

  addInputMapping() {
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    const varName = prompt('Enter process variable name:');
    const workflowInput = prompt('Enter workflow input name:');
    if (varName && workflowInput) {
      if (!element.properties.inputMapping) element.properties.inputMapping = {};
      element.properties.inputMapping[varName] = workflowInput;
      this.renderMappings(element, 'input');
      this.saveSnapshot();
    }
  }

  addOutputMapping() {
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    const varName = prompt('Enter process variable name:');
    const workflowOutput = prompt('Enter workflow output name:');
    if (varName && workflowOutput) {
      if (!element.properties.outputMapping) element.properties.outputMapping = {};
      element.properties.outputMapping[varName] = workflowOutput;
      this.renderMappings(element, 'output');
      this.saveSnapshot();
    }
  }

  addFieldMapping() {
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    const field = prompt('Enter CRM field name:');
    const variable = prompt('Enter process variable name:');
    if (field && variable) {
      if (!element.properties.fieldMapping) element.properties.fieldMapping = {};
      element.properties.fieldMapping[field] = variable;
      this.renderFieldMappings(element);
      this.saveSnapshot();
    }
  }

  removeMapping(type, key) {
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    const mapping = type === 'input' ? element.properties.inputMapping : element.properties.outputMapping;
    delete mapping[key];
    this.renderMappings(element, type);
    this.saveSnapshot();
  }

  removeFieldMapping(field) {
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    delete element.properties.fieldMapping[field];
    this.renderFieldMappings(element);
    this.saveSnapshot();
  }

  updateElementLabel(element) {
    const group = document.getElementById(element.id);
    if (!group) return;

    const text = group.querySelector('text[y="60"]');
    if (text) text.textContent = element.name;

    const taskText = group.querySelector('text[y="5"]');
    if (taskText) {
      taskText.textContent = element.name.length > 12 ? element.name.substr(0, 12) + '...' : element.name;
    }
  }

  duplicateElement() {
    if (!this.selectedElement) return;
    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    this.addElement(element.type, element.x + 100, element.y + 50);
    this.saveSnapshot();
    this.showNotification('Element duplicated', 'success');
  }

  deleteElement() {
    if (!this.selectedElement) return;

    if (!confirm('Delete this element?')) return;

    const element = this.elements.get(this.selectedElement);
    if (!element) return;

    // Remove connections
    this.connections.forEach((conn, id) => {
      if (conn.sourceId === element.id || conn.targetId === element.id) {
        document.getElementById(id)?.remove();
        this.connections.delete(id);
      }
    });

    // Remove element
    document.getElementById(element.id)?.remove();
    this.elements.delete(element.id);
    this.selectedElement = null;
    this.updatePropertiesPanel();
    this.saveSnapshot();
    this.showNotification('Element deleted', 'success');
  }

  updateConnections(elementId) {
    // Update all connections involving this element
    this.connections.forEach(conn => {
      if (conn.sourceId === elementId || conn.targetId === elementId) {
        this.updateConnectionLine(conn);
      }
    });
  }

  updateConnectionLine(conn) {
    const connGroup = document.getElementById(conn.id);
    if (!connGroup) return;

    const source = this.elements.get(conn.sourceId);
    const target = this.elements.get(conn.targetId);
    if (!source || !target) return;

    const line = connGroup.querySelector('line');
    if (line) {
      line.setAttribute('x1', source.x);
      line.setAttribute('y1', source.y);
      line.setAttribute('x2', target.x);
      line.setAttribute('y2', target.y);
    }

    // Update label position if present
    const text = connGroup.querySelector('text');
    if (text) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      text.setAttribute('x', midX);
      text.setAttribute('y', midY - 5);
    }
  }

  handleCanvasClick(e) {
    if (e.target === this.canvasElement || e.target === this.mainGroup) {
      this.selectedElement = null;
      this.selectedConnection = null;

      // Unhighlight all connections
      document.querySelectorAll('.connection-group line').forEach(line => {
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke', '#475569');
      });

      this.updatePropertiesPanel();
    }
  }

  handleKeydown(e) {
    if (e.key === 'Delete') {
      if (this.selectedElement) {
        this.deleteElement();
      } else if (this.selectedConnection) {
        this.deleteConnection();
      }
    } else if (e.key === 'c' || e.key === 'C') {
      if (!e.ctrlKey && !e.metaKey) {
        this.toggleConnectionMode();
      }
    } else if (e.key === 'Escape') {
      if (this.connectionMode) {
        this.cancelConnection();
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (e.key === 'z' && e.shiftKey || e.key === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 's') {
        e.preventDefault();
        this.saveProcess();
      } else if (e.key === 'd') {
        e.preventDefault();
        this.duplicateElement();
      }
    }
  }

  zoomIn() {
    this.zoom *= 1.2;
    this.zoom = Math.min(3, this.zoom);
    this.updateTransform();
  }

  zoomOut() {
    this.zoom *= 0.8;
    this.zoom = Math.max(0.1, this.zoom);
    this.updateTransform();
  }

  fitToView() {
    this.zoom = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.updateTransform();
  }

  autoLayout() {
    // Simple auto-layout algorithm
    let x = 100;
    let y = 100;
    const spacing = 150;

    Array.from(this.elements.values()).forEach((element, index) => {
      element.x = x;
      element.y = y;

      const group = document.getElementById(element.id);
      if (group) {
        group.setAttribute('transform', `translate(${element.x}, ${element.y})`);
      }

      x += spacing;
      if ((index + 1) % 4 === 0) {
        x = 100;
        y += 120;
      }
    });

    this.updateConnections();
    this.saveSnapshot();
    this.showNotification('Layout applied', 'success');
  }

  saveSnapshot() {
    const snapshot = {
      elements: Array.from(this.elements.entries()),
      connections: Array.from(this.connections.entries())
    };

    // Remove future history if we're in the middle
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(JSON.stringify(snapshot));
    this.historyIndex++;

    // Limit history to 50 steps
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }

    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreSnapshot(this.history[this.historyIndex]);
      this.updateUndoRedoButtons();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreSnapshot(this.history[this.historyIndex]);
      this.updateUndoRedoButtons();
    }
  }

  restoreSnapshot(snapshotStr) {
    const snapshot = JSON.parse(snapshotStr);

    // Clear canvas
    this.mainGroup.querySelectorAll('.bpmn-element-group').forEach(el => el.remove());
    this.elements.clear();
    this.connections.clear();

    // Restore elements
    snapshot.elements.forEach(([id, element]) => {
      this.elements.set(id, element);
      this.renderElement(element);
    });

    // Restore connections
    snapshot.connections.forEach(([id, conn]) => {
      this.connections.set(id, conn);
      // Redraw connections if needed
    });

    this.updatePropertiesPanel();
  }

  updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = this.historyIndex <= 0;
    document.getElementById('redo-btn').disabled = this.historyIndex >= this.history.length - 1;
  }

  async loadWorkflows() {
    try {
      // Load workflows from exprsn-workflow service
      const response = await fetch(`http://localhost:3017/api/workflows`);
      if (response.ok) {
        const data = await response.json();
        this.workflows = data.workflows || [];
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
      this.workflows = [];
    }
  }

  async loadProcess() {
    if (!this.processId) return;

    try {
      const response = await fetch(`/lowcode/api/processes/${this.processId}`);
      if (!response.ok) throw new Error('Failed to load process');

      const data = await response.json();
      if (data.success && data.process) {
        const process = data.process;

        // Load definition
        if (process.definition && process.definition.elements) {
          process.definition.elements.forEach(el => {
            this.elements.set(el.id, el);
            this.renderElement(el);
          });
        }

        if (process.definition && process.definition.connections) {
          process.definition.connections.forEach(conn => {
            this.connections.set(conn.id, conn);
            this.renderConnection(conn);
          });
        }

        this.updateBPMNXML();
      }
    } catch (error) {
      console.error('Failed to load process:', error);
      this.showNotification('Failed to load process', 'error');
    }
  }

  async saveProcess() {
    const processName = document.getElementById('process-name').value;
    if (!processName) {
      this.showNotification('Please enter a process name', 'error');
      return;
    }

    const definition = {
      elements: Array.from(this.elements.values()),
      connections: Array.from(this.connections.values())
    };

    const bpmnXML = this.generateBPMNXML();

    const processData = {
      name: processName.toLowerCase().replace(/\s+/g, '-'),
      displayName: processName,
      definition,
      bpmnDefinition: bpmnXML
    };

    try {
      const url = this.processId
        ? `/lowcode/api/processes/${this.processId}`
        : `/lowcode/api/applications/${this.applicationId}/processes`;

      const method = this.processId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processData)
      });

      if (!response.ok) throw new Error('Failed to save process');

      const data = await response.json();
      if (data.success) {
        if (!this.processId) {
          this.processId = data.process.id;
          window.history.pushState({}, '', `/lowcode/processes/${this.processId}/designer`);
        }
        this.showNotification('Process saved successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to save process:', error);
      this.showNotification('Failed to save process', 'error');
    }
  }

  async activateProcess() {
    if (!this.processId) {
      this.showNotification('Please save the process first', 'error');
      return;
    }

    if (!confirm('Activate this process? It will be available for execution.')) return;

    try {
      const response = await fetch(`/lowcode/api/processes/${this.processId}/activate`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to activate process');

      const data = await response.json();
      if (data.success) {
        document.getElementById('process-status').textContent = 'active';
        document.getElementById('process-status').className = 'process-status active';
        this.showNotification('Process activated successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to activate process:', error);
      this.showNotification('Failed to activate process', 'error');
    }
  }

  validateProcess() {
    const errors = [];

    // Check for start event
    const hasStart = Array.from(this.elements.values()).some(el => el.type === 'start-event');
    if (!hasStart) errors.push('Process must have a Start Event');

    // Check for end event
    const hasEnd = Array.from(this.elements.values()).some(el => el.type === 'end-event');
    if (!hasEnd) errors.push('Process must have an End Event');

    // Check for orphaned elements (no connections)
    if (this.elements.size > 2 && this.connections.size === 0) {
      errors.push('Elements are not connected');
    }

    if (errors.length > 0) {
      alert('Validation Errors:\n\n' + errors.join('\n'));
      this.showNotification('Validation failed', 'error');
    } else {
      this.showNotification('Process is valid!', 'success');
    }
  }

  testProcess() {
    this.showNotification('Test run feature coming soon', 'info');
    // TODO: Implement test run with sample data
  }

  generateBPMNXML() {
    // Generate BPMN 2.0 XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ';
    xml += 'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ';
    xml += 'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ';
    xml += 'xmlns:di="http://www.omg.org/spec/DD/20100524/DI">\n';
    xml += '  <bpmn:process id="process-1" isExecutable="true">\n';

    this.elements.forEach(element => {
      xml += this.elementToBPMN(element);
    });

    this.connections.forEach(conn => {
      xml += this.connectionToBPMN(conn);
    });

    xml += '  </bpmn:process>\n';
    xml += '</bpmn:definitions>';

    return xml;
  }

  elementToBPMN(element) {
    const id = element.id;
    const name = element.name;

    if (element.type === 'start-event') {
      return `    <bpmn:startEvent id="${id}" name="${name}"/>\n`;
    } else if (element.type === 'end-event') {
      return `    <bpmn:endEvent id="${id}" name="${name}"/>\n`;
    } else if (element.type.includes('task')) {
      return `    <bpmn:task id="${id}" name="${name}"/>\n`;
    } else if (element.type.includes('gateway')) {
      return `    <bpmn:exclusiveGateway id="${id}" name="${name}"/>\n`;
    }
    return '';
  }

  connectionToBPMN(conn) {
    return `    <bpmn:sequenceFlow id="${conn.id}" sourceRef="${conn.sourceId}" targetRef="${conn.targetId}"/>\n`;
  }

  updateBPMNXML() {
    if (!this.xmlEditor) return;
    const xml = this.generateBPMNXML();
    this.xmlEditor.setValue(xml);
  }

  copyXML() {
    const xml = this.generateBPMNXML();
    navigator.clipboard.writeText(xml);
    this.showNotification('BPMN XML copied to clipboard', 'success');
  }

  initializeMonacoEditor() {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      this.xmlEditor = monaco.editor.create(document.getElementById('bpmn-xml-editor'), {
        value: this.generateBPMNXML(),
        language: 'xml',
        theme: 'vs-light',
        automaticLayout: true,
        minimap: { enabled: false },
        readOnly: true
      });
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}
