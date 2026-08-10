/**
 * Dashboard Designer - Drag-and-Drop Dashboard Builder
 * Uses GridStack for layout management
 */

class DashboardDesigner {
  constructor(options) {
    this.dashboardData = options.dashboardData;
    this.appId = options.appId;

    // Dashboard configuration
    this.config = {
      id: this.dashboardData?.id || null,
      name: this.dashboardData?.displayName || 'New Dashboard',
      description: this.dashboardData?.description || '',
      applicationId: this.appId,
      refreshInterval: this.dashboardData?.config?.refreshInterval || 30,
      widgets: this.dashboardData?.config?.widgets || []
    };

    // GridStack instance
    this.grid = null;
    this.widgets = new Map();
    this.selectedWidget = null;
    this.widgetCounter = 0;

    // Initialize
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.initializeGrid();

    // Load existing widgets if editing
    if (this.config.widgets.length > 0) {
      this.loadWidgets();
    }
  }

  setupEventListeners() {
    // Widget drag from toolbox
    document.querySelectorAll('.widget-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('widget-type', item.dataset.widgetType);
      });
    });

    // Header actions
    document.getElementById('clear-dashboard-btn').addEventListener('click', () => {
      this.clearDashboard();
    });

    document.getElementById('save-draft-btn').addEventListener('click', () => {
      this.saveDashboard(false);
    });

    document.getElementById('publish-btn').addEventListener('click', () => {
      this.saveDashboard(true);
    });

    // Toolbar actions
    document.getElementById('grid-settings-btn').addEventListener('click', () => {
      this.showGridSettings();
    });

    document.getElementById('auto-layout-btn').addEventListener('click', () => {
      this.autoLayout();
    });

    // Properties modal
    document.getElementById('close-properties-btn').addEventListener('click', () => {
      this.closePropertiesModal();
    });

    document.getElementById('cancel-properties-btn').addEventListener('click', () => {
      this.closePropertiesModal();
    });

    document.getElementById('save-properties-btn').addEventListener('click', () => {
      this.saveWidgetProperties();
    });
  }

  initializeGrid() {
    this.grid = GridStack.init({
      cellHeight: 80,
      column: 12,
      float: true,
      acceptWidgets: true,
      removable: false,
      resizable: {
        handles: 'e, se, s, sw, w'
      }
    }, '#dashboard-grid');

    // Handle drop from external source
    this.grid.on('dropped', (event, previousWidget, newWidget) => {
      if (event.dataTransfer) {
        const widgetType = event.dataTransfer.getData('widget-type');
        if (widgetType) {
          this.addWidget(widgetType, newWidget);
        }
      }
    });

    // Handle changes
    this.grid.on('change', (event, items) => {
      this.hideEmptyState();
    });
  }

  addWidget(type, gridPosition = null) {
    const widgetId = `widget-${++this.widgetCounter}`;

    // Default widget config
    const widgetConfig = {
      id: widgetId,
      type,
      title: this.getDefaultWidgetTitle(type),
      config: this.getDefaultWidgetConfig(type),
      x: gridPosition?.x || 0,
      y: gridPosition?.y || 0,
      w: gridPosition?.w || 4,
      h: gridPosition?.h || 3
    };

    // Create widget element
    const widgetHTML = this.renderWidget(widgetConfig);

    // Add to grid
    if (gridPosition) {
      this.grid.removeWidget(gridPosition.el);
    }

    this.grid.addWidget({
      content: widgetHTML,
      x: widgetConfig.x,
      y: widgetConfig.y,
      w: widgetConfig.w,
      h: widgetConfig.h,
      id: widgetId
    });

    // Store widget config
    this.widgets.set(widgetId, widgetConfig);

    // Setup widget event listeners
    this.setupWidgetListeners(widgetId);

    this.hideEmptyState();
  }

  renderWidget(widget) {
    return `
      <div class="grid-stack-item-content">
        <div class="widget-header">
          <div class="widget-title">${widget.title}</div>
          <div class="widget-actions">
            <button class="widget-btn" data-action="refresh" data-widget-id="${widget.id}">
              <i class="fas fa-sync"></i>
            </button>
            <button class="widget-btn" data-action="configure" data-widget-id="${widget.id}">
              <i class="fas fa-cog"></i>
            </button>
            <button class="widget-btn" data-action="delete" data-widget-id="${widget.id}">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="widget-body" id="widget-body-${widget.id}">
          ${this.renderWidgetBody(widget)}
        </div>
      </div>
    `;
  }

  renderWidgetBody(widget) {
    switch (widget.type) {
      case 'chart':
        return `<canvas id="chart-${widget.id}"></canvas>`;

      case 'metric':
        return this.renderMetricWidget(widget);

      case 'table':
        return `
          <div style="overflow: auto; height: 100%;">
            <table style="width: 100%; font-size: 0.875rem;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">Column 1</th>
                  <th style="text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">Column 2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">Sample data</td>
                  <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">Sample data</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;

      case 'grid':
        return `<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">Entity Grid: ${widget.config.entityName || 'Not configured'}</div>`;

      case 'text':
        return `<div style="color: var(--text-primary);">${widget.config.content || 'Text widget content'}</div>`;

      case 'html':
        return widget.config.html || '<div style="color: var(--text-secondary);">HTML content</div>';

      case 'iframe':
        return widget.config.url
          ? `<iframe src="${widget.config.url}" style="width: 100%; height: 100%; border: none;"></iframe>`
          : '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">IFrame: No URL configured</div>';

      case 'process-stats':
        return this.renderProcessStatsWidget(widget);

      case 'task-list':
        return `<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">Task List: Loading...</div>`;

      default:
        return `<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">Unknown widget type: ${widget.type}</div>`;
    }
  }

  renderMetricWidget(widget) {
    const value = widget.config.value || '0';
    const label = widget.config.label || 'Metric';
    const change = widget.config.change || null;

    let changeHTML = '';
    if (change !== null) {
      const changeClass = change >= 0 ? 'positive' : 'negative';
      const changeIcon = change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
      changeHTML = `
        <div class="metric-change ${changeClass}">
          <i class="fas ${changeIcon}"></i> ${Math.abs(change)}%
        </div>
      `;
    }

    return `
      <div class="metric-card">
        <div class="metric-value">${value}</div>
        <div class="metric-label">${label}</div>
        ${changeHTML}
      </div>
    `;
  }

  renderProcessStatsWidget(widget) {
    return `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; padding: 1rem;">
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #3b82f6;">45</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">RUNNING</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">123</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">COMPLETED</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #f59e0b;">12</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">WAITING</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #ef4444;">3</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">ERROR</div>
        </div>
      </div>
    `;
  }

  setupWidgetListeners(widgetId) {
    // Wait for element to be added to DOM
    setTimeout(() => {
      const widget = document.querySelector(`[gs-id="${widgetId}"]`);
      if (!widget) return;

      // Refresh button
      const refreshBtn = widget.querySelector('[data-action="refresh"]');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.refreshWidget(widgetId);
        });
      }

      // Configure button
      const configBtn = widget.querySelector('[data-action="configure"]');
      if (configBtn) {
        configBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.configureWidget(widgetId);
        });
      }

      // Delete button
      const deleteBtn = widget.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteWidget(widgetId);
        });
      }
    }, 100);
  }

  getDefaultWidgetTitle(type) {
    const titles = {
      chart: 'Chart Widget',
      metric: 'Metric Card',
      table: 'Data Table',
      grid: 'Entity Grid',
      text: 'Text Widget',
      html: 'HTML Widget',
      iframe: 'IFrame Widget',
      'process-stats': 'Process Statistics',
      'task-list': 'Task List'
    };
    return titles[type] || 'Widget';
  }

  getDefaultWidgetConfig(type) {
    const configs = {
      chart: {
        chartType: 'bar',
        dataSource: 'static',
        data: []
      },
      metric: {
        value: 0,
        label: 'Metric',
        change: null
      },
      table: {
        dataSource: 'static',
        columns: [],
        data: []
      },
      grid: {
        entityId: null,
        entityName: null
      },
      text: {
        content: 'Text content'
      },
      html: {
        html: '<div>HTML content</div>'
      },
      iframe: {
        url: ''
      },
      'process-stats': {
        processId: null
      },
      'task-list': {
        filter: 'all'
      }
    };
    return configs[type] || {};
  }

  configureWidget(widgetId) {
    const widget = this.widgets.get(widgetId);
    if (!widget) return;

    this.selectedWidget = widgetId;
    this.showPropertiesModal(widget);
  }

  showPropertiesModal(widget) {
    const modal = document.getElementById('properties-modal');
    const body = document.getElementById('properties-body');

    // Generate properties form based on widget type
    body.innerHTML = this.generatePropertiesForm(widget);

    // Show modal
    modal.classList.add('active');
  }

  generatePropertiesForm(widget) {
    let html = `
      <div class="form-field">
        <label class="form-label">Widget Title</label>
        <input type="text" class="form-input" id="prop-title" value="${widget.title}">
      </div>
    `;

    switch (widget.type) {
      case 'metric':
        html += `
          <div class="form-field">
            <label class="form-label">Metric Value</label>
            <input type="text" class="form-input" id="prop-value" value="${widget.config.value}">
          </div>
          <div class="form-field">
            <label class="form-label">Metric Label</label>
            <input type="text" class="form-input" id="prop-label" value="${widget.config.label}">
          </div>
          <div class="form-field">
            <label class="form-label">Change Percentage (optional)</label>
            <input type="number" class="form-input" id="prop-change" value="${widget.config.change || ''}" placeholder="5.2">
            <div class="form-hint">Positive for increase, negative for decrease</div>
          </div>
        `;
        break;

      case 'text':
        html += `
          <div class="form-field">
            <label class="form-label">Content</label>
            <textarea class="form-textarea" id="prop-content">${widget.config.content}</textarea>
          </div>
        `;
        break;

      case 'html':
        html += `
          <div class="form-field">
            <label class="form-label">HTML Content</label>
            <textarea class="form-textarea" id="prop-html" style="min-height: 200px;">${widget.config.html}</textarea>
          </div>
        `;
        break;

      case 'iframe':
        html += `
          <div class="form-field">
            <label class="form-label">URL</label>
            <input type="url" class="form-input" id="prop-url" value="${widget.config.url || ''}" placeholder="https://example.com">
          </div>
        `;
        break;

      case 'chart':
        html += `
          <div class="form-field">
            <label class="form-label">Chart Type</label>
            <select class="form-select" id="prop-chart-type">
              <option value="bar" ${widget.config.chartType === 'bar' ? 'selected' : ''}>Bar</option>
              <option value="line" ${widget.config.chartType === 'line' ? 'selected' : ''}>Line</option>
              <option value="pie" ${widget.config.chartType === 'pie' ? 'selected' : ''}>Pie</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Data Source</label>
            <select class="form-select" id="prop-data-source">
              <option value="static" ${widget.config.dataSource === 'static' ? 'selected' : ''}>Static</option>
              <option value="entity" ${widget.config.dataSource === 'entity' ? 'selected' : ''}>Entity</option>
              <option value="api" ${widget.config.dataSource === 'api' ? 'selected' : ''}>API</option>
            </select>
          </div>
        `;
        break;

      case 'grid':
        html += `
          <div class="form-field">
            <label class="form-label">Entity</label>
            <select class="form-select" id="prop-entity-id">
              <option value="">Select Entity...</option>
            </select>
          </div>
        `;
        break;

      case 'process-stats':
        html += `
          <div class="form-field">
            <label class="form-label">Process</label>
            <select class="form-select" id="prop-process-id">
              <option value="">Select Process...</option>
            </select>
          </div>
        `;
        break;
    }

    return html;
  }

  saveWidgetProperties() {
    if (!this.selectedWidget) return;

    const widget = this.widgets.get(this.selectedWidget);
    if (!widget) return;

    // Update title
    const title = document.getElementById('prop-title')?.value;
    if (title) widget.title = title;

    // Update type-specific properties
    switch (widget.type) {
      case 'metric':
        widget.config.value = document.getElementById('prop-value')?.value || '0';
        widget.config.label = document.getElementById('prop-label')?.value || 'Metric';
        const changeVal = document.getElementById('prop-change')?.value;
        widget.config.change = changeVal ? parseFloat(changeVal) : null;
        break;

      case 'text':
        widget.config.content = document.getElementById('prop-content')?.value || '';
        break;

      case 'html':
        widget.config.html = document.getElementById('prop-html')?.value || '';
        break;

      case 'iframe':
        widget.config.url = document.getElementById('prop-url')?.value || '';
        break;

      case 'chart':
        widget.config.chartType = document.getElementById('prop-chart-type')?.value || 'bar';
        widget.config.dataSource = document.getElementById('prop-data-source')?.value || 'static';
        break;
    }

    // Update widget in grid
    const gridWidget = document.querySelector(`[gs-id="${this.selectedWidget}"]`);
    if (gridWidget) {
      const content = gridWidget.querySelector('.grid-stack-item-content');
      if (content) {
        content.innerHTML = this.renderWidget(widget);
        this.setupWidgetListeners(this.selectedWidget);
      }
    }

    this.closePropertiesModal();
  }

  closePropertiesModal() {
    document.getElementById('properties-modal').classList.remove('active');
    this.selectedWidget = null;
  }

  refreshWidget(widgetId) {
    console.log('Refreshing widget:', widgetId);
    // In a real implementation, would reload widget data
    this.showNotification('Widget refreshed', 'info');
  }

  deleteWidget(widgetId) {
    if (!confirm('Delete this widget?')) return;

    // Remove from grid
    const gridWidget = document.querySelector(`[gs-id="${widgetId}"]`);
    if (gridWidget) {
      this.grid.removeWidget(gridWidget);
    }

    // Remove from widgets map
    this.widgets.delete(widgetId);

    // Show empty state if no widgets
    if (this.widgets.size === 0) {
      this.showEmptyState();
    }
  }

  clearDashboard() {
    if (!confirm('Clear all widgets from dashboard?')) return;

    this.grid.removeAll();
    this.widgets.clear();
    this.showEmptyState();
  }

  showEmptyState() {
    document.getElementById('empty-dashboard').style.display = 'flex';
  }

  hideEmptyState() {
    document.getElementById('empty-dashboard').style.display = 'none';
  }

  loadWidgets() {
    this.config.widgets.forEach(widgetConfig => {
      this.widgetCounter++;
      const widgetHTML = this.renderWidget(widgetConfig);

      this.grid.addWidget({
        content: widgetHTML,
        x: widgetConfig.x,
        y: widgetConfig.y,
        w: widgetConfig.w,
        h: widgetConfig.h,
        id: widgetConfig.id
      });

      this.widgets.set(widgetConfig.id, widgetConfig);
      this.setupWidgetListeners(widgetConfig.id);
    });

    this.hideEmptyState();
  }

  autoLayout() {
    // Simple auto-layout: arrange widgets in 3-column grid
    let x = 0;
    let y = 0;
    const widgetWidth = 4;
    const widgetHeight = 3;

    this.grid.batchUpdate();

    this.widgets.forEach((widget, widgetId) => {
      const gridWidget = document.querySelector(`[gs-id="${widgetId}"]`);
      if (gridWidget) {
        this.grid.update(gridWidget, { x, y, w: widgetWidth, h: widgetHeight });

        x += widgetWidth;
        if (x >= 12) {
          x = 0;
          y += widgetHeight;
        }
      }
    });

    this.grid.commit();
    this.showNotification('Auto-layout applied', 'success');
  }

  showGridSettings() {
    const cellHeight = prompt('Enter grid cell height (px):', '80');
    if (cellHeight && !isNaN(cellHeight)) {
      this.grid.cellHeight(parseInt(cellHeight));
      this.showNotification('Grid settings updated', 'success');
    }
  }

  async saveDashboard(publish = false) {
    try {
      // Collect widget configurations
      const widgets = [];
      this.widgets.forEach((widget, widgetId) => {
        const gridWidget = document.querySelector(`[gs-id="${widgetId}"]`);
        if (gridWidget) {
          const node = this.grid.engine.nodes.find(n => n.id === widgetId);
          if (node) {
            widgets.push({
              ...widget,
              x: node.x,
              y: node.y,
              w: node.w,
              h: node.h
            });
          }
        }
      });

      // Prepare payload
      const payload = {
        displayName: this.config.name,
        description: this.config.description,
        applicationId: this.config.applicationId,
        status: publish ? 'published' : 'draft',
        config: {
          refreshInterval: this.config.refreshInterval,
          widgets
        }
      };

      // Save or update
      const url = this.config.id
        ? `/lowcode/api/dashboards/${this.config.id}`
        : '/lowcode/api/dashboards';

      const method = this.config.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save dashboard');
      }

      const result = await response.json();

      if (result.success) {
        this.config.id = result.data.id;
        this.showNotification(
          publish ? 'Dashboard published successfully!' : 'Dashboard saved as draft',
          'success'
        );

        // Redirect after publish
        if (publish) {
          setTimeout(() => {
            window.location.href = `/lowcode/designer?appId=${this.appId}`;
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to save dashboard:', error);
      alert('Failed to save dashboard: ' + error.message);
    }
  }

  showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}
