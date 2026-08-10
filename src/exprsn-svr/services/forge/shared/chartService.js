/**
 * Chart Service
 * Handles Chart.js integration with custom colors, real-time refresh, and complex chart types
 */

const logger = require('../../../utils/logger');

class ChartService {
  constructor() {
    // Standard chart types
    this.chartTypes = {
      BAR: 'bar',
      HORIZONTAL_BAR: 'horizontalBar',
      LINE: 'line',
      AREA: 'area',
      PIE: 'pie',
      DONUT: 'doughnut',
      SCATTER: 'scatter',
      BUBBLE: 'bubble',
      RADAR: 'radar',
      POLAR: 'polarArea'
    };

    // Complex chart types (custom implementations)
    this.complexChartTypes = {
      STACKED_BAR: 'stacked_bar',
      STACKED_COLUMN: 'stacked_column',
      STACKED_AREA: 'stacked_area',
      GROUPED_BAR: 'grouped_bar',
      GROUPED_COLUMN: 'grouped_column',
      COMBO: 'combo',                  // Line + Bar
      WATERFALL: 'waterfall',
      FUNNEL: 'funnel',
      GAUGE: 'gauge',
      TREEMAP: 'treemap',
      SUNBURST: 'sunburst',
      HEATMAP: 'heatmap',
      CANDLESTICK: 'candlestick',
      SANKEY: 'sankey',
      BOXPLOT: 'boxplot'
    };

    // Color palettes
    this.colorPalettes = {
      default: [
        '#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC',
        '#00ACC1', '#FF7043', '#9E9D24', '#5C6BC0', '#F06292'
      ],
      pastel: [
        '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
        '#E0BBE4', '#FFDAC1', '#C7CEEA', '#B5EAD7', '#FF9AA2'
      ],
      vibrant: [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C06C84'
      ],
      corporate: [
        '#2C3E50', '#34495E', '#7F8C8D', '#95A5A6', '#BDC3C7',
        '#3498DB', '#2980B9', '#1ABC9C', '#16A085', '#27AE60'
      ],
      monochrome: [
        '#1A1A1A', '#333333', '#4D4D4D', '#666666', '#808080',
        '#999999', '#B3B3B3', '#CCCCCC', '#E6E6E6', '#F2F2F2'
      ],
      warm: [
        '#D32F2F', '#E64A19', '#F57C00', '#FFA000', '#FBC02D',
        '#AFB42B', '#689F38', '#388E3C', '#00796B', '#0097A7'
      ],
      cool: [
        '#1976D2', '#1E88E5', '#039BE5', '#00ACC1', '#00897B',
        '#43A047', '#7CB342', '#C0CA33', '#FDD835', '#FFB300'
      ]
    };

    // Active chart instances for real-time updates
    this.activeCharts = new Map();

    // Refresh intervals
    this.refreshIntervals = new Map();
  }

  /**
   * Generate chart configuration
   */
  generateChartConfig(chartConfig, data, options = {}) {
    const {
      chartType,
      xAxis,
      yAxis,
      series,
      title,
      colors,
      showLegend = true,
      showTooltip = true,
      legendPosition = 'top',
      gridLines = true,
      animations = true,
      stacked = false,
      responsive = true,
      maintainAspectRatio = false
    } = chartConfig;

    // Select color palette
    const colorPalette = this.getColorPalette(colors);

    // Build datasets
    const datasets = this.buildDatasets(data, yAxis, series, colorPalette, {
      chartType,
      stacked
    });

    // Build labels (X-axis values)
    const labels = this.extractLabels(data, xAxis);

    // Chart.js configuration
    const config = {
      type: this.getChartJsType(chartType),
      data: {
        labels,
        datasets
      },
      options: {
        responsive,
        maintainAspectRatio,

        // Plugins
        plugins: {
          title: {
            display: !!title,
            text: title || '',
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 20 }
          },
          legend: {
            display: showLegend,
            position: legendPosition,
            labels: {
              usePointStyle: true,
              padding: 15,
              font: { size: 12 }
            }
          },
          tooltip: {
            enabled: showTooltip,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            cornerRadius: 4,
            padding: 12,
            displayColors: true,
            callbacks: this.getTooltipCallbacks(chartType)
          }
        },

        // Scales
        scales: this.buildScales(chartType, {
          gridLines,
          stacked
        }),

        // Animation
        animation: animations ? {
          duration: 750,
          easing: 'easeInOutQuart'
        } : false,

        // Interaction
        interaction: {
          mode: 'index',
          intersect: false
        }
      }
    };

    return config;
  }

  /**
   * Build datasets for Chart.js
   */
  buildDatasets(data, yAxis, series, colorPalette, options = {}) {
    const { chartType, stacked } = options;

    // Single series
    if (!series) {
      const yFields = Array.isArray(yAxis) ? yAxis : [yAxis];

      return yFields.map((field, index) => ({
        label: this.formatLabel(field),
        data: data.map(row => row[field]),
        backgroundColor: this.getBackgroundColor(colorPalette[index % colorPalette.length], chartType),
        borderColor: colorPalette[index % colorPalette.length],
        borderWidth: 2,
        fill: chartType === 'area',
        tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
        stack: stacked ? 'stack1' : undefined
      }));
    }

    // Multi-series (grouped by series field)
    const grouped = this.groupBy(data, series);
    const yField = Array.isArray(yAxis) ? yAxis[0] : yAxis;

    return Object.keys(grouped).map((key, index) => ({
      label: key,
      data: grouped[key].map(row => row[yField]),
      backgroundColor: this.getBackgroundColor(colorPalette[index % colorPalette.length], chartType),
      borderColor: colorPalette[index % colorPalette.length],
      borderWidth: 2,
      fill: chartType === 'area',
      tension: chartType === 'line' || chartType === 'area' ? 0.4 : 0,
      stack: stacked ? 'stack1' : undefined
    }));
  }

  /**
   * Extract labels from data
   */
  extractLabels(data, xAxis) {
    return data.map(row => {
      const value = row[xAxis];

      // Format dates
      if (value instanceof Date) {
        return value.toLocaleDateString();
      }

      return value;
    });
  }

  /**
   * Build scales configuration
   */
  buildScales(chartType, options = {}) {
    const { gridLines, stacked } = options;

    // No scales for pie/donut/radar/polar
    if (['pie', 'doughnut', 'radar', 'polarArea'].includes(chartType)) {
      return {};
    }

    return {
      x: {
        stacked: stacked || false,
        grid: {
          display: gridLines,
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          font: { size: 11 },
          color: '#666'
        }
      },
      y: {
        stacked: stacked || false,
        beginAtZero: true,
        grid: {
          display: gridLines,
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          font: { size: 11 },
          color: '#666',
          callback: function(value) {
            // Format large numbers
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'K';
            }
            return value;
          }
        }
      }
    };
  }

  /**
   * Get tooltip callbacks
   */
  getTooltipCallbacks(chartType) {
    return {
      label: function(context) {
        let label = context.dataset.label || '';

        if (label) {
          label += ': ';
        }

        const value = context.parsed.y !== null ? context.parsed.y : context.parsed;

        // Format value
        if (typeof value === 'number') {
          label += value.toLocaleString();
        } else {
          label += value;
        }

        return label;
      }
    };
  }

  /**
   * Get Chart.js type from custom type
   */
  getChartJsType(chartType) {
    const typeMap = {
      bar: 'bar',
      column: 'bar',
      line: 'line',
      area: 'line',
      pie: 'pie',
      donut: 'doughnut',
      doughnut: 'doughnut',
      scatter: 'scatter',
      bubble: 'bubble',
      radar: 'radar',
      polar: 'polarArea',
      stacked_bar: 'bar',
      stacked_column: 'bar',
      grouped_bar: 'bar'
    };

    return typeMap[chartType] || 'bar';
  }

  /**
   * Get background color based on chart type
   */
  getBackgroundColor(color, chartType) {
    // Solid colors for pie/donut
    if (['pie', 'doughnut'].includes(chartType)) {
      return color;
    }

    // Semi-transparent for bars/areas
    return this.hexToRgba(color, 0.7);
  }

  /**
   * Get color palette
   */
  getColorPalette(colors) {
    if (Array.isArray(colors)) {
      return colors;
    }

    if (typeof colors === 'string' && this.colorPalettes[colors]) {
      return this.colorPalettes[colors];
    }

    return this.colorPalettes.default;
  }

  /**
   * Generate combo chart (line + bar)
   */
  generateComboChart(data, config) {
    const { xAxis, yAxisBar, yAxisLine, colors } = config;

    const colorPalette = this.getColorPalette(colors);
    const labels = this.extractLabels(data, xAxis);

    const datasets = [
      {
        type: 'bar',
        label: this.formatLabel(yAxisBar),
        data: data.map(row => row[yAxisBar]),
        backgroundColor: this.hexToRgba(colorPalette[0], 0.7),
        borderColor: colorPalette[0],
        borderWidth: 2,
        order: 2
      },
      {
        type: 'line',
        label: this.formatLabel(yAxisLine),
        data: data.map(row => row[yAxisLine]),
        backgroundColor: 'transparent',
        borderColor: colorPalette[1],
        borderWidth: 3,
        tension: 0.4,
        fill: false,
        order: 1
      }
    ];

    return {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: { enabled: true }
        },
        scales: this.buildScales('bar', { gridLines: true })
      }
    };
  }

  /**
   * Generate waterfall chart
   */
  generateWaterfallChart(data, config) {
    const { xAxis, yAxis, colors } = config;

    const colorPalette = this.getColorPalette(colors);
    const labels = this.extractLabels(data, xAxis);

    // Calculate cumulative values for waterfall
    let cumulative = 0;
    const waterfallData = data.map((row, index) => {
      const value = row[yAxis];
      const start = cumulative;
      cumulative += value;

      return {
        x: labels[index],
        y: [start, cumulative],
        backgroundColor: value >= 0 ? colorPalette[0] : colorPalette[1]
      };
    });

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: this.formatLabel(yAxis),
          data: waterfallData,
          backgroundColor: waterfallData.map(d => d.backgroundColor),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const data = context.raw;
                const diff = data.y[1] - data.y[0];
                return `Change: ${diff.toLocaleString()} (${data.y[0].toLocaleString()} → ${data.y[1].toLocaleString()})`;
              }
            }
          }
        }
      }
    };
  }

  /**
   * Generate funnel chart
   */
  generateFunnelChart(data, config) {
    const { xAxis, yAxis, colors } = config;

    const colorPalette = this.getColorPalette(colors);
    const labels = this.extractLabels(data, xAxis);
    const values = data.map(row => row[yAxis]);

    // Calculate percentages for funnel
    const max = Math.max(...values);
    const percentages = values.map(v => (v / max) * 100);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: this.formatLabel(yAxis),
          data: values,
          backgroundColor: colorPalette[0],
          borderColor: colorPalette[0],
          borderWidth: 2,
          barPercentage: 0.8
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed.x;
                const percentage = ((value / max) * 100).toFixed(1);
                return `${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: max * 1.1
          }
        }
      }
    };
  }

  /**
   * Generate gauge chart
   */
  generateGaugeChart(value, config) {
    const { min = 0, max = 100, title, colors, thresholds } = config;

    const percentage = ((value - min) / (max - min)) * 100;
    const colorPalette = this.getColorPalette(colors);

    return {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [percentage, 100 - percentage],
          backgroundColor: [
            this.getGaugeColor(percentage, thresholds, colorPalette),
            '#E0E0E0'
          ],
          borderWidth: 0,
          circumference: 180,
          rotation: 270
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          title: {
            display: !!title,
            text: title || '',
            position: 'bottom',
            font: { size: 14, weight: 'bold' }
          }
        },
        cutout: '75%'
      },
      plugins: [{
        id: 'gaugeValue',
        afterDraw: (chart) => {
          const { ctx, chartArea: { width, height } } = chart;
          ctx.save();
          ctx.font = 'bold 32px Arial';
          ctx.fillStyle = '#333';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(value.toFixed(1), width / 2, height / 1.5);
          ctx.restore();
        }
      }]
    };
  }

  /**
   * Get gauge color based on thresholds
   */
  getGaugeColor(percentage, thresholds, colorPalette) {
    if (!thresholds) {
      return colorPalette[0];
    }

    if (percentage < thresholds.warning) {
      return colorPalette[1]; // Red
    } else if (percentage < thresholds.good) {
      return colorPalette[2]; // Yellow
    } else {
      return colorPalette[0]; // Green
    }
  }

  /**
   * Setup real-time chart refresh
   */
  setupRealtimeRefresh(chartId, fetchDataFn, updateInterval = 5000, options = {}) {
    const { prefetch = false, onUpdate, onError } = options;

    // Clear existing interval
    if (this.refreshIntervals.has(chartId)) {
      clearInterval(this.refreshIntervals.get(chartId));
    }

    // Set up new interval
    const intervalId = setInterval(async () => {
      try {
        logger.debug('Refreshing chart data', { chartId });

        // Fetch new data
        const newData = await fetchDataFn();

        // Store in active charts
        this.activeCharts.set(chartId, newData);

        // Call update callback
        if (onUpdate) {
          onUpdate(newData);
        }

        // Prefetch next batch if enabled
        if (prefetch) {
          setTimeout(async () => {
            try {
              await fetchDataFn();
            } catch (err) {
              logger.warn('Prefetch failed', { chartId, error: err.message });
            }
          }, updateInterval / 2);
        }
      } catch (err) {
        logger.error('Chart refresh failed', { chartId, error: err.message });

        if (onError) {
          onError(err);
        }
      }
    }, updateInterval);

    this.refreshIntervals.set(chartId, intervalId);

    logger.info('Setup real-time chart refresh', { chartId, interval: updateInterval, prefetch });

    return intervalId;
  }

  /**
   * Stop real-time refresh
   */
  stopRealtimeRefresh(chartId) {
    if (this.refreshIntervals.has(chartId)) {
      clearInterval(this.refreshIntervals.get(chartId));
      this.refreshIntervals.delete(chartId);
      this.activeCharts.delete(chartId);

      logger.info('Stopped real-time chart refresh', { chartId });
    }
  }

  /**
   * Utility: Group by
   */
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    }, {});
  }

  /**
   * Utility: Format label
   */
  formatLabel(str) {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Utility: Hex to RGBA
   */
  hexToRgba(hex, alpha = 1) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    if (!result) {
      return hex;
    }

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Get all color palettes
   */
  getColorPalettes() {
    return Object.keys(this.colorPalettes);
  }

  /**
   * Add custom color palette
   */
  addColorPalette(name, colors) {
    if (!Array.isArray(colors) || colors.length === 0) {
      throw new Error('Colors must be a non-empty array');
    }

    this.colorPalettes[name] = colors;

    logger.info('Added custom color palette', { name, colorCount: colors.length });

    return { name, colors };
  }
}

module.exports = new ChartService();
