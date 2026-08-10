/**
 * Chart Designer - Visual Chart Configuration Engine
 * Supports 6 chart types with real-time preview
 */

class ChartDesigner {
  constructor(options) {
    this.chartData = options.chartData;
    this.appId = options.appId;

    // Chart configuration
    this.config = {
      id: this.chartData?.id || null,
      name: this.chartData?.displayName || 'New Chart',
      description: this.chartData?.description || '',
      applicationId: this.appId,
      type: this.chartData?.config?.type || 'bar',

      // Axis configuration
      xAxisLabel: this.chartData?.config?.xAxisLabel || '',
      yAxisLabel: this.chartData?.config?.yAxisLabel || '',

      // Styling
      colorScheme: this.chartData?.config?.colorScheme || 'default',
      customColors: this.chartData?.config?.customColors || [],
      showLegend: this.chartData?.config?.showLegend !== false,
      legendPosition: this.chartData?.config?.legendPosition || 'top',
      showGrid: this.chartData?.config?.showGrid !== false,

      // Advanced
      enableAnimation: this.chartData?.config?.enableAnimation !== false,
      animationDuration: this.chartData?.config?.animationDuration || 1000,
      maintainAspectRatio: this.chartData?.config?.maintainAspectRatio !== false,
      allowExport: this.chartData?.config?.allowExport !== false,

      // Data source
      dataSource: {
        type: this.chartData?.config?.dataSource?.type || 'static',
        config: this.chartData?.config?.dataSource?.config || {}
      }
    };

    // Data
    this.data = [];
    this.chart = null;

    // Initialize
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.loadFormValues();
    await this.loadEntities();

    // Load existing data if editing
    if (this.chartData?.config?.dataSource) {
      await this.loadDataSource();
    } else {
      // Load sample data
      this.loadSampleData();
    }

    this.renderPreview();
  }

  setupEventListeners() {
    // Configuration tabs
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchConfigTab(e.target.dataset.tab);
      });
    });

    // Chart type selection
    document.querySelectorAll('.chart-type').forEach(type => {
      type.addEventListener('click', (e) => {
        const typeEl = e.target.closest('.chart-type');
        this.selectChartType(typeEl.dataset.type);
      });
    });

    // General configuration
    document.getElementById('chart-name').addEventListener('input', (e) => {
      this.config.name = e.target.value;
      document.getElementById('chart-title').textContent = e.target.value || 'New Chart';
    });

    document.getElementById('chart-description').addEventListener('input', (e) => {
      this.config.description = e.target.value;
    });

    document.getElementById('x-axis-label').addEventListener('input', (e) => {
      this.config.xAxisLabel = e.target.value;
      this.renderPreview();
    });

    document.getElementById('y-axis-label').addEventListener('input', (e) => {
      this.config.yAxisLabel = e.target.value;
      this.renderPreview();
    });

    // Styling
    document.getElementById('color-scheme').addEventListener('change', (e) => {
      this.config.colorScheme = e.target.value;
      document.getElementById('custom-colors-field').style.display =
        e.target.value === 'custom' ? 'block' : 'none';
      this.renderPreview();
    });

    document.getElementById('custom-colors').addEventListener('input', (e) => {
      this.config.customColors = e.target.value.split(',').map(c => c.trim());
      if (this.config.colorScheme === 'custom') {
        this.renderPreview();
      }
    });

    document.getElementById('show-legend').addEventListener('change', (e) => {
      this.config.showLegend = e.target.checked;
      document.getElementById('legend-position-field').style.display =
        e.target.checked ? 'block' : 'none';
      this.renderPreview();
    });

    document.getElementById('legend-position').addEventListener('change', (e) => {
      this.config.legendPosition = e.target.value;
      this.renderPreview();
    });

    document.getElementById('show-grid').addEventListener('change', (e) => {
      this.config.showGrid = e.target.checked;
      this.renderPreview();
    });

    // Advanced
    document.getElementById('enable-animation').addEventListener('change', (e) => {
      this.config.enableAnimation = e.target.checked;
      document.getElementById('animation-duration-field').style.display =
        e.target.checked ? 'block' : 'none';
      this.renderPreview();
    });

    document.getElementById('animation-duration').addEventListener('input', (e) => {
      this.config.animationDuration = parseInt(e.target.value);
      if (this.config.enableAnimation) {
        this.renderPreview();
      }
    });

    document.getElementById('maintain-aspect-ratio').addEventListener('change', (e) => {
      this.config.maintainAspectRatio = e.target.checked;
      this.renderPreview();
    });

    document.getElementById('allow-export').addEventListener('change', (e) => {
      this.config.allowExport = e.target.checked;
    });

    // Data source
    document.getElementById('data-source-type').addEventListener('change', (e) => {
      this.config.dataSource.type = e.target.value;
      this.switchDataSourceConfig(e.target.value);
    });

    // Static data
    document.getElementById('load-static-data-btn').addEventListener('click', () => {
      this.loadStaticData();
    });

    // Entity data
    document.getElementById('entity-select').addEventListener('change', async (e) => {
      await this.loadEntityFields(e.target.value);
    });

    document.getElementById('load-entity-data-btn').addEventListener('click', () => {
      this.loadEntityData();
    });

    // API data
    document.getElementById('load-api-data-btn').addEventListener('click', () => {
      this.loadAPIData();
    });

    // JSONLex data
    document.getElementById('load-jsonlex-data-btn').addEventListener('click', () => {
      this.loadJSONLexData();
    });

    // Header actions
    document.getElementById('refresh-preview-btn').addEventListener('click', () => {
      this.renderPreview();
    });

    document.getElementById('save-draft-btn').addEventListener('click', () => {
      this.saveChart(false);
    });

    document.getElementById('publish-btn').addEventListener('click', () => {
      this.saveChart(true);
    });

    document.getElementById('export-chart-btn').addEventListener('click', () => {
      this.exportChart();
    });
  }

  loadFormValues() {
    document.getElementById('chart-name').value = this.config.name;
    document.getElementById('chart-description').value = this.config.description;
    document.getElementById('x-axis-label').value = this.config.xAxisLabel;
    document.getElementById('y-axis-label').value = this.config.yAxisLabel;

    document.getElementById('color-scheme').value = this.config.colorScheme;
    document.getElementById('custom-colors').value = this.config.customColors.join(', ');
    document.getElementById('show-legend').checked = this.config.showLegend;
    document.getElementById('legend-position').value = this.config.legendPosition;
    document.getElementById('show-grid').checked = this.config.showGrid;

    document.getElementById('enable-animation').checked = this.config.enableAnimation;
    document.getElementById('animation-duration').value = this.config.animationDuration;
    document.getElementById('maintain-aspect-ratio').checked = this.config.maintainAspectRatio;
    document.getElementById('allow-export').checked = this.config.allowExport;

    document.getElementById('data-source-type').value = this.config.dataSource.type;

    // Show/hide conditional fields
    document.getElementById('custom-colors-field').style.display =
      this.config.colorScheme === 'custom' ? 'block' : 'none';
    document.getElementById('legend-position-field').style.display =
      this.config.showLegend ? 'block' : 'none';
    document.getElementById('animation-duration-field').style.display =
      this.config.enableAnimation ? 'block' : 'none';
  }

  switchConfigTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.config-tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tabContent === tabName);
      content.style.display = content.dataset.tabContent === tabName ? 'block' : 'none';
    });
  }

  selectChartType(type) {
    this.config.type = type;

    // Update UI
    document.querySelectorAll('.chart-type').forEach(t => {
      t.classList.toggle('active', t.dataset.type === type);
    });

    this.renderPreview();
  }

  switchDataSourceConfig(type) {
    // Hide all configs
    document.querySelectorAll('.data-source-config').forEach(config => {
      config.style.display = 'none';
    });

    // Show selected config
    document.getElementById(`${type}-data-config`).style.display = 'block';
  }

  loadSampleData() {
    this.data = [
      { label: 'January', value: 65 },
      { label: 'February', value: 59 },
      { label: 'March', value: 80 },
      { label: 'April', value: 81 },
      { label: 'May', value: 56 },
      { label: 'June', value: 55 }
    ];

    this.updateDataPreview();
    this.renderPreview();
  }

  loadStaticData() {
    try {
      const input = document.getElementById('static-data').value.trim();
      if (!input) {
        alert('Please enter data');
        return;
      }

      const data = JSON.parse(input);
      if (!Array.isArray(data)) {
        throw new Error('Data must be an array');
      }

      this.data = data;
      this.config.dataSource.config = { data };
      this.updateDataPreview();
      this.renderPreview();

      this.showNotification('Static data loaded successfully', 'success');
    } catch (error) {
      console.error('Failed to load static data:', error);
      alert('Failed to parse data: ' + error.message);
    }
  }

  async loadEntities() {
    try {
      const response = await fetch(`/lowcode/api/entities?applicationId=${this.appId}`);
      const result = await response.json();

      if (result.success) {
        const select = document.getElementById('entity-select');
        select.innerHTML = '<option value="">Select Entity...</option>';

        result.data.forEach(entity => {
          const option = document.createElement('option');
          option.value = entity.id;
          option.textContent = entity.displayName;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load entities:', error);
    }
  }

  async loadEntityFields(entityId) {
    try {
      const response = await fetch(`/lowcode/api/entities/${entityId}/fields`);
      const result = await response.json();

      if (result.success) {
        const labelSelect = document.getElementById('entity-label-field');
        const valueSelect = document.getElementById('entity-value-field');

        labelSelect.innerHTML = '<option value="">Select Field...</option>';
        valueSelect.innerHTML = '<option value="">Select Field...</option>';

        result.data.forEach(field => {
          const labelOption = document.createElement('option');
          labelOption.value = field.name;
          labelOption.textContent = field.displayName;
          labelSelect.appendChild(labelOption);

          const valueOption = document.createElement('option');
          valueOption.value = field.name;
          valueOption.textContent = field.displayName;
          valueSelect.appendChild(valueOption);
        });
      }
    } catch (error) {
      console.error('Failed to load entity fields:', error);
    }
  }

  async loadEntityData() {
    try {
      const entityId = document.getElementById('entity-select').value;
      const labelField = document.getElementById('entity-label-field').value;
      const valueField = document.getElementById('entity-value-field').value;

      if (!entityId || !labelField || !valueField) {
        alert('Please select entity and fields');
        return;
      }

      const response = await fetch(`/lowcode/api/entities/${entityId}/data`);
      const result = await response.json();

      if (result.success) {
        this.data = result.data.map(record => ({
          label: record[labelField],
          value: record[valueField]
        }));

        this.config.dataSource.config = { entityId, labelField, valueField };
        this.updateDataPreview();
        this.renderPreview();

        this.showNotification('Entity data loaded successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to load entity data:', error);
      alert('Failed to load entity data: ' + error.message);
    }
  }

  async loadAPIData() {
    try {
      const url = document.getElementById('api-url').value.trim();
      const method = document.getElementById('api-method').value;
      const responsePath = document.getElementById('api-response-path').value.trim();

      if (!url) {
        alert('Please enter API URL');
        return;
      }

      const response = await fetch(url, { method });
      let data = await response.json();

      // Navigate to response path if specified
      if (responsePath) {
        const parts = responsePath.split('.');
        for (const part of parts) {
          data = data[part];
        }
      }

      if (!Array.isArray(data)) {
        throw new Error('Response data must be an array');
      }

      this.data = data;
      this.config.dataSource.config = { url, method, responsePath };
      this.updateDataPreview();
      this.renderPreview();

      this.showNotification('API data loaded successfully', 'success');
    } catch (error) {
      console.error('Failed to load API data:', error);
      alert('Failed to load API data: ' + error.message);
    }
  }

  async loadJSONLexData() {
    try {
      const expression = document.getElementById('jsonlex-expression').value.trim();

      if (!expression) {
        alert('Please enter JSONLex expression');
        return;
      }

      // In a real implementation, this would call JSONLex service
      // For now, we'll use a simple eval (NOT RECOMMENDED IN PRODUCTION)
      alert('JSONLex integration not yet implemented. Use static data for now.');

    } catch (error) {
      console.error('Failed to load JSONLex data:', error);
      alert('Failed to execute JSONLex: ' + error.message);
    }
  }

  async loadDataSource() {
    const { type, config } = this.config.dataSource;

    switch (type) {
      case 'static':
        if (config.data) {
          document.getElementById('static-data').value = JSON.stringify(config.data, null, 2);
          this.loadStaticData();
        }
        break;

      case 'entity':
        if (config.entityId) {
          document.getElementById('entity-select').value = config.entityId;
          await this.loadEntityFields(config.entityId);
          document.getElementById('entity-label-field').value = config.labelField;
          document.getElementById('entity-value-field').value = config.valueField;
          await this.loadEntityData();
        }
        break;

      case 'api':
        if (config.url) {
          document.getElementById('api-url').value = config.url;
          document.getElementById('api-method').value = config.method;
          document.getElementById('api-response-path').value = config.responsePath || '';
          await this.loadAPIData();
        }
        break;

      case 'jsonlex':
        if (config.expression) {
          document.getElementById('jsonlex-expression').value = config.expression;
        }
        break;
    }

    this.switchDataSourceConfig(type);
  }

  updateDataPreview() {
    const tbody = document.getElementById('data-preview-body');
    tbody.innerHTML = '';

    this.data.slice(0, 10).forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.label || '-'}</td>
        <td>${item.value || '-'}</td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById('data-count').textContent = this.data.length;
    document.getElementById('data-preview-section').style.display =
      this.data.length > 0 ? 'block' : 'none';
  }

  renderPreview() {
    const canvas = document.getElementById('chart-preview');
    const ctx = canvas.getContext('2d');

    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
    }

    // Get colors
    const colors = this.getColors();

    // Prepare chart data
    const chartData = {
      labels: this.data.map(d => d.label),
      datasets: [{
        label: this.config.name,
        data: this.data.map(d => d.value),
        backgroundColor: colors,
        borderColor: colors.map(c => c),
        borderWidth: 2
      }]
    };

    // Chart options
    const options = {
      responsive: true,
      maintainAspectRatio: this.config.maintainAspectRatio,
      animation: {
        duration: this.config.enableAnimation ? this.config.animationDuration : 0
      },
      plugins: {
        legend: {
          display: this.config.showLegend,
          position: this.config.legendPosition
        },
        title: {
          display: true,
          text: this.config.name
        }
      },
      scales: {}
    };

    // Add scales for non-circular charts
    if (!['pie', 'doughnut'].includes(this.config.type)) {
      options.scales = {
        x: {
          title: {
            display: !!this.config.xAxisLabel,
            text: this.config.xAxisLabel
          },
          grid: {
            display: this.config.showGrid
          }
        },
        y: {
          title: {
            display: !!this.config.yAxisLabel,
            text: this.config.yAxisLabel
          },
          grid: {
            display: this.config.showGrid
          }
        }
      };
    }

    // Create chart
    this.chart = new Chart(ctx, {
      type: this.config.type,
      data: chartData,
      options
    });
  }

  getColors() {
    const schemes = {
      default: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
      rainbow: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'],
      pastel: ['#fca5a5', '#fdba74', '#fcd34d', '#86efac', '#93c5fd', '#c4b5fd'],
      monochrome: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'],
      custom: this.config.customColors.filter(c => c)
    };

    const colors = schemes[this.config.colorScheme] || schemes.default;

    // Repeat colors if more data points than colors
    const repeated = [];
    for (let i = 0; i < this.data.length; i++) {
      repeated.push(colors[i % colors.length]);
    }

    return repeated;
  }

  async saveChart(publish = false) {
    try {
      // Validate
      if (!this.config.name.trim()) {
        alert('Please enter a chart name');
        return;
      }

      if (this.data.length === 0) {
        alert('Please load data for the chart');
        return;
      }

      // Prepare payload
      const payload = {
        displayName: this.config.name,
        description: this.config.description,
        applicationId: this.config.applicationId,
        status: publish ? 'published' : 'draft',
        config: {
          type: this.config.type,
          xAxisLabel: this.config.xAxisLabel,
          yAxisLabel: this.config.yAxisLabel,
          colorScheme: this.config.colorScheme,
          customColors: this.config.customColors,
          showLegend: this.config.showLegend,
          legendPosition: this.config.legendPosition,
          showGrid: this.config.showGrid,
          enableAnimation: this.config.enableAnimation,
          animationDuration: this.config.animationDuration,
          maintainAspectRatio: this.config.maintainAspectRatio,
          allowExport: this.config.allowExport,
          dataSource: this.config.dataSource
        }
      };

      // Save or update
      const url = this.config.id
        ? `/lowcode/api/charts/${this.config.id}`
        : '/lowcode/api/charts';

      const method = this.config.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save chart');
      }

      const result = await response.json();

      if (result.success) {
        this.config.id = result.data.id;
        this.showNotification(
          publish ? 'Chart published successfully!' : 'Chart saved as draft',
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
      console.error('Failed to save chart:', error);
      alert('Failed to save chart: ' + error.message);
    }
  }

  exportChart() {
    if (!this.config.allowExport) {
      alert('Export is disabled for this chart');
      return;
    }

    if (!this.chart) {
      alert('No chart to export');
      return;
    }

    // Export as PNG
    const url = this.chart.toBase64Image();
    const link = document.createElement('a');
    link.download = `${this.config.name.replace(/[^a-z0-9]/gi, '_')}.png`;
    link.href = url;
    link.click();

    this.showNotification('Chart exported successfully', 'success');
  }

  showNotification(message, type = 'info') {
    // Simple notification (could be enhanced with a toast library)
    console.log(`[${type.toUpperCase()}] ${message}`);

    // You could use a toast library here for better UX
    if (type === 'error') {
      alert(message);
    }
  }
}
