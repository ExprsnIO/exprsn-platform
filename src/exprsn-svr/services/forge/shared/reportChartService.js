/**
 * Report Chart Service
 * Handles interactive chart generation and visualization for reports
 * Supports 15+ chart types with customization options
 */

const logger = require('../../../utils/logger');

class ReportChartService {
  constructor() {
    // Supported chart types
    this.chartTypes = {
      LINE: 'line',
      BAR: 'bar',
      HORIZONTAL_BAR: 'horizontal_bar',
      PIE: 'pie',
      DOUGHNUT: 'doughnut',
      AREA: 'area',
      SCATTER: 'scatter',
      BUBBLE: 'bubble',
      RADAR: 'radar',
      POLAR: 'polar',
      GAUGE: 'gauge',
      HEATMAP: 'heatmap',
      TREEMAP: 'treemap',
      FUNNEL: 'funnel',
      WATERFALL: 'waterfall',
      TABLE: 'table'
    };

    // Default chart configurations
    this.defaultConfig = {
      width: 800,
      height: 400,
      responsive: true,
      maintainAspectRatio: false,
      animations: {
        enabled: true,
        duration: 750
      }
    };
  }

  /**
   * Create chart configuration for a report
   */
  createChartConfig(chartType, data, options = {}) {
    if (!Object.values(this.chartTypes).includes(chartType)) {
      throw new Error(`Unsupported chart type: ${chartType}`);
    }

    const config = {
      type: chartType,
      data: this.formatDataForChart(chartType, data, options),
      options: this.buildChartOptions(chartType, options),
      ...this.defaultConfig,
      ...options
    };

    logger.debug('Chart config created', { chartType, dataPoints: data.length });
    return config;
  }

  /**
   * Format data based on chart type
   */
  formatDataForChart(chartType, data, options) {
    switch (chartType) {
      case this.chartTypes.LINE:
      case this.chartTypes.AREA:
      case this.chartTypes.BAR:
      case this.chartTypes.HORIZONTAL_BAR:
        return this.formatCategoricalData(data, options);

      case this.chartTypes.PIE:
      case this.chartTypes.DOUGHNUT:
      case this.chartTypes.POLAR:
        return this.formatProportionalData(data, options);

      case this.chartTypes.SCATTER:
      case this.chartTypes.BUBBLE:
        return this.formatScatterData(data, options);

      case this.chartTypes.HEATMAP:
        return this.formatHeatmapData(data, options);

      case this.chartTypes.GAUGE:
        return this.formatGaugeData(data, options);

      case this.chartTypes.FUNNEL:
        return this.formatFunnelData(data, options);

      case this.chartTypes.WATERFALL:
        return this.formatWaterfallData(data, options);

      case this.chartTypes.TREEMAP:
        return this.formatTreemapData(data, options);

      case this.chartTypes.RADAR:
        return this.formatRadarData(data, options);

      default:
        return this.formatGenericData(data, options);
    }
  }

  /**
   * Format data for line, bar, area charts
   */
  formatCategoricalData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      groupField = null,
      colors = this.getDefaultColors()
    } = options;

    // If no grouping, return single dataset
    if (!groupField) {
      return {
        labels: data.map(d => d[labelField]),
        datasets: [{
          label: options.datasetLabel || 'Value',
          data: data.map(d => d[valueField]),
          backgroundColor: colors[0],
          borderColor: colors[0],
          borderWidth: 2,
          fill: options.fill || false
        }]
      };
    }

    // Group data by groupField
    const grouped = this.groupBy(data, groupField);
    const labels = [...new Set(data.map(d => d[labelField]))];

    const datasets = Object.entries(grouped).map(([group, items], index) => ({
      label: group,
      data: labels.map(label => {
        const item = items.find(i => i[labelField] === label);
        return item ? item[valueField] : 0;
      }),
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length],
      borderWidth: 2,
      fill: options.fill || false
    }));

    return { labels, datasets };
  }

  /**
   * Format data for pie, doughnut charts
   */
  formatProportionalData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      colors = this.getDefaultColors(),
      showPercentages = true
    } = options;

    const total = data.reduce((sum, d) => sum + d[valueField], 0);

    return {
      labels: data.map(d => {
        const label = d[labelField];
        if (showPercentages) {
          const percentage = ((d[valueField] / total) * 100).toFixed(1);
          return `${label} (${percentage}%)`;
        }
        return label;
      }),
      datasets: [{
        data: data.map(d => d[valueField]),
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  }

  /**
   * Format data for scatter and bubble charts
   */
  formatScatterData(data, options) {
    const {
      xField = 'x',
      yField = 'y',
      radiusField = 'r',
      groupField = null,
      colors = this.getDefaultColors()
    } = options;

    if (!groupField) {
      return {
        datasets: [{
          label: options.datasetLabel || 'Data',
          data: data.map(d => ({
            x: d[xField],
            y: d[yField],
            r: radiusField ? d[radiusField] : 5
          })),
          backgroundColor: colors[0]
        }]
      };
    }

    // Group data for multiple series
    const grouped = this.groupBy(data, groupField);

    const datasets = Object.entries(grouped).map(([group, items], index) => ({
      label: group,
      data: items.map(d => ({
        x: d[xField],
        y: d[yField],
        r: radiusField ? d[radiusField] : 5
      })),
      backgroundColor: colors[index % colors.length]
    }));

    return { datasets };
  }

  /**
   * Format data for heatmap
   */
  formatHeatmapData(data, options) {
    const {
      xField = 'x',
      yField = 'y',
      valueField = 'value',
      colorScale = 'interpolateViridis'
    } = options;

    // Create matrix structure
    const xLabels = [...new Set(data.map(d => d[xField]))];
    const yLabels = [...new Set(data.map(d => d[yField]))];

    const matrix = yLabels.map(y =>
      xLabels.map(x => {
        const cell = data.find(d => d[xField] === x && d[yField] === y);
        return cell ? cell[valueField] : 0;
      })
    );

    return {
      xLabels,
      yLabels,
      data: matrix,
      colorScale
    };
  }

  /**
   * Format data for gauge chart
   */
  formatGaugeData(data, options) {
    const {
      valueField = 'value',
      minValue = 0,
      maxValue = 100,
      thresholds = [
        { value: 33, color: '#dc3545' },  // Red
        { value: 66, color: '#ffc107' },  // Yellow
        { value: 100, color: '#28a745' }  // Green
      ]
    } = options;

    const value = Array.isArray(data) ? data[0][valueField] : data[valueField];

    return {
      value,
      min: minValue,
      max: maxValue,
      thresholds
    };
  }

  /**
   * Format data for funnel chart
   */
  formatFunnelData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      colors = this.getDefaultColors()
    } = options;

    // Sort by value descending for funnel effect
    const sorted = [...data].sort((a, b) => b[valueField] - a[valueField]);

    return {
      labels: sorted.map(d => d[labelField]),
      values: sorted.map(d => d[valueField]),
      colors: colors.slice(0, sorted.length)
    };
  }

  /**
   * Format data for waterfall chart
   */
  formatWaterfallData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      typeField = 'type' // 'increase', 'decrease', 'total'
    } = options;

    let runningTotal = 0;
    const formatted = data.map(d => {
      const value = d[valueField];
      const type = d[typeField] || 'increase';

      const start = type === 'total' ? 0 : runningTotal;
      const end = type === 'total' ? runningTotal : runningTotal + value;

      if (type !== 'total') {
        runningTotal += value;
      }

      return {
        label: d[labelField],
        start,
        end,
        value,
        type
      };
    });

    return {
      labels: formatted.map(d => d.label),
      data: formatted
    };
  }

  /**
   * Format data for treemap
   */
  formatTreemapData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      parentField = 'parent',
      colors = this.getDefaultColors()
    } = options;

    // Build hierarchical structure
    const tree = {
      name: 'root',
      children: []
    };

    // Build tree structure from flat data
    const itemMap = new Map();

    data.forEach(d => {
      itemMap.set(d[labelField], {
        name: d[labelField],
        value: d[valueField],
        parent: d[parentField],
        children: []
      });
    });

    data.forEach(d => {
      const item = itemMap.get(d[labelField]);
      const parent = d[parentField] ? itemMap.get(d[parentField]) : tree;

      if (parent) {
        parent.children.push(item);
      }
    });

    return tree;
  }

  /**
   * Format data for radar chart
   */
  formatRadarData(data, options) {
    const {
      labelField = 'label',
      valueField = 'value',
      groupField = null,
      colors = this.getDefaultColors()
    } = options;

    const labels = [...new Set(data.map(d => d[labelField]))];

    if (!groupField) {
      return {
        labels,
        datasets: [{
          label: options.datasetLabel || 'Value',
          data: labels.map(label => {
            const item = data.find(d => d[labelField] === label);
            return item ? item[valueField] : 0;
          }),
          backgroundColor: this.addAlpha(colors[0], 0.2),
          borderColor: colors[0],
          pointBackgroundColor: colors[0]
        }]
      };
    }

    // Multiple datasets for comparison
    const grouped = this.groupBy(data, groupField);

    const datasets = Object.entries(grouped).map(([group, items], index) => ({
      label: group,
      data: labels.map(label => {
        const item = items.find(i => i[labelField] === label);
        return item ? item[valueField] : 0;
      }),
      backgroundColor: this.addAlpha(colors[index % colors.length], 0.2),
      borderColor: colors[index % colors.length],
      pointBackgroundColor: colors[index % colors.length]
    }));

    return { labels, datasets };
  }

  /**
   * Format generic data
   */
  formatGenericData(data, options) {
    return {
      labels: data.map((d, i) => d.label || `Item ${i + 1}`),
      values: data.map(d => d.value || 0)
    };
  }

  /**
   * Build chart-specific options
   */
  buildChartOptions(chartType, options) {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: options.maintainAspectRatio !== undefined
        ? options.maintainAspectRatio
        : false,
      plugins: {
        legend: {
          display: options.showLegend !== undefined ? options.showLegend : true,
          position: options.legendPosition || 'top'
        },
        title: {
          display: !!options.title,
          text: options.title || ''
        },
        tooltip: {
          enabled: options.showTooltip !== undefined ? options.showTooltip : true
        }
      }
    };

    // Add chart-specific options
    switch (chartType) {
      case this.chartTypes.LINE:
      case this.chartTypes.AREA:
      case this.chartTypes.BAR:
      case this.chartTypes.HORIZONTAL_BAR:
        baseOptions.scales = {
          x: {
            title: {
              display: !!options.xAxisLabel,
              text: options.xAxisLabel || ''
            }
          },
          y: {
            title: {
              display: !!options.yAxisLabel,
              text: options.yAxisLabel || ''
            },
            beginAtZero: options.beginAtZero !== undefined ? options.beginAtZero : true
          }
        };
        break;

      case this.chartTypes.HORIZONTAL_BAR:
        baseOptions.indexAxis = 'y';
        break;
    }

    return baseOptions;
  }

  /**
   * Generate chart configuration from report data
   */
  generateChartFromReport(report, data, chartOptions = {}) {
    try {
      // Use visualization config from report if available
      const vizConfig = report.visualization || {};

      const chartType = chartOptions.chartType || vizConfig.chartType || this.chartTypes.BAR;
      const config = chartOptions.config || vizConfig.config || {};

      const chartConfig = this.createChartConfig(chartType, data, {
        ...config,
        ...chartOptions
      });

      logger.info('Chart generated for report', {
        reportId: report.id,
        chartType,
        dataPoints: data.length
      });

      return chartConfig;
    } catch (error) {
      logger.error('Failed to generate chart', {
        reportId: report.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save chart configuration to report
   */
  async saveChartConfig(report, chartConfig) {
    try {
      report.visualization = chartConfig;
      await report.save();

      logger.info('Chart config saved', { reportId: report.id });
      return report;
    } catch (error) {
      logger.error('Failed to save chart config', {
        reportId: report.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get default color palette
   */
  getDefaultColors() {
    return [
      '#3b82f6', // Blue
      '#10b981', // Green
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Purple
      '#ec4899', // Pink
      '#06b6d4', // Cyan
      '#f97316', // Orange
      '#84cc16', // Lime
      '#6366f1', // Indigo
      '#14b8a6', // Teal
      '#f43f5e'  // Rose
    ];
  }

  /**
   * Add alpha transparency to hex color
   */
  addAlpha(color, alpha) {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  /**
   * Group array by field
   */
  groupBy(array, field) {
    return array.reduce((groups, item) => {
      const key = item[field];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {});
  }

  /**
   * Get chart type metadata
   */
  getChartTypeMetadata(chartType) {
    const metadata = {
      [this.chartTypes.LINE]: {
        name: 'Line Chart',
        description: 'Display trends over time with connected data points',
        requiredFields: ['label', 'value'],
        optionalFields: ['group'],
        useCases: ['Time series', 'Trends', 'Comparisons']
      },
      [this.chartTypes.BAR]: {
        name: 'Bar Chart',
        description: 'Compare values across categories with vertical bars',
        requiredFields: ['label', 'value'],
        optionalFields: ['group'],
        useCases: ['Comparisons', 'Rankings', 'Distribution']
      },
      [this.chartTypes.PIE]: {
        name: 'Pie Chart',
        description: 'Show proportions of a whole',
        requiredFields: ['label', 'value'],
        optionalFields: [],
        useCases: ['Proportions', 'Percentages', 'Composition']
      },
      [this.chartTypes.GAUGE]: {
        name: 'Gauge Chart',
        description: 'Display a single metric with thresholds',
        requiredFields: ['value'],
        optionalFields: ['min', 'max', 'thresholds'],
        useCases: ['KPIs', 'Performance metrics', 'Progress']
      },
      [this.chartTypes.HEATMAP]: {
        name: 'Heatmap',
        description: 'Visualize data intensity across two dimensions',
        requiredFields: ['x', 'y', 'value'],
        optionalFields: [],
        useCases: ['Correlations', 'Patterns', 'Density']
      },
      [this.chartTypes.FUNNEL]: {
        name: 'Funnel Chart',
        description: 'Show progressive reduction in stages',
        requiredFields: ['label', 'value'],
        optionalFields: [],
        useCases: ['Conversion rates', 'Sales pipeline', 'Process flows']
      }
      // Add more metadata as needed
    };

    return metadata[chartType] || { name: chartType, description: 'Custom chart type' };
  }

  /**
   * List all available chart types with metadata
   */
  listChartTypes() {
    return Object.entries(this.chartTypes).map(([key, value]) => ({
      id: value,
      ...this.getChartTypeMetadata(value)
    }));
  }
}

module.exports = new ReportChartService();
