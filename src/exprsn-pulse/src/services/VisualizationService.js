/**
 * Visualization Service
 * Handles visualization creation, configuration, and rendering
 */

const { Visualization, Dataset } = require('../models');
const logger = require('../utils/logger');

class VisualizationService {
  /**
   * Create a new visualization
   */
  static async create(data, userId) {
    try {
      // Validate dataset exists
      const dataset = await Dataset.findByPk(data.datasetId);
      if (!dataset) {
        throw new Error('Dataset not found');
      }

      // Validate data mapping against dataset schema
      this._validateDataMapping(data.dataMapping, dataset.schema);

      const visualization = await Visualization.create({
        ...data,
        createdBy: userId
      });

      logger.info('Visualization created', {
        visualizationId: visualization.id,
        type: visualization.type,
        renderer: visualization.renderer
      });

      return visualization;
    } catch (error) {
      logger.error('Failed to create visualization', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate data mapping against schema
   */
  static _validateDataMapping(mapping, schema) {
    // Ensure mapped columns exist in dataset schema
    const schemaFields = Object.keys(schema);

    for (const [key, value] of Object.entries(mapping)) {
      if (typeof value === 'string' && !schemaFields.includes(value)) {
        throw new Error(`Mapped field '${value}' does not exist in dataset schema`);
      }
    }
  }

  /**
   * Render visualization data
   */
  static async render(visualizationId, options = {}) {
    const visualization = await Visualization.findByPk(visualizationId, {
      include: [{ model: Dataset, as: 'dataset' }]
    });

    if (!visualization) {
      throw new Error('Visualization not found');
    }

    const dataset = visualization.dataset;

    // Check if dataset is expired
    if (dataset.expiresAt && new Date() > dataset.expiresAt && !dataset.isSnapshot) {
      if (options.autoRefresh) {
        const DatasetService = require('./DatasetService');
        await DatasetService.refresh(dataset.id);
        // Reload dataset
        await dataset.reload();
      } else {
        logger.warn('Dataset expired', { datasetId: dataset.id });
      }
    }

    // Apply filters
    let data = dataset.data;
    if (visualization.filters && visualization.filters.length > 0) {
      data = this._applyFilters(data, visualization.filters);
    }

    // Apply aggregations
    if (visualization.aggregations && visualization.aggregations.length > 0) {
      data = this._applyAggregations(data, visualization.aggregations, visualization.dataMapping);
    }

    // Transform data based on visualization type and renderer
    let renderedData;

    switch (visualization.renderer) {
      case 'chartjs':
        renderedData = this._renderChartJS(visualization, data);
        break;
      case 'd3':
        renderedData = this._renderD3(visualization, data);
        break;
      case 'custom':
        renderedData = this._renderCustom(visualization, data);
        break;
      default:
        throw new Error(`Unknown renderer: ${visualization.renderer}`);
    }

    return {
      visualization: {
        id: visualization.id,
        name: visualization.name,
        type: visualization.type,
        renderer: visualization.renderer,
        config: visualization.config
      },
      data: renderedData,
      metadata: {
        rowCount: data.length,
        generatedAt: new Date().toISOString(),
        datasetId: dataset.id
      }
    };
  }

  /**
   * Apply filters to data
   */
  static _applyFilters(data, filters) {
    return data.filter(row => {
      return filters.every(filter => {
        const value = row[filter.field];
        const filterValue = filter.value;

        switch (filter.operator) {
          case 'equals':
            return value == filterValue;
          case 'not_equals':
            return value != filterValue;
          case 'contains':
            return String(value).includes(filterValue);
          case 'not_contains':
            return !String(value).includes(filterValue);
          case 'greater_than':
            return value > filterValue;
          case 'less_than':
            return value < filterValue;
          case 'in':
            return Array.isArray(filterValue) && filterValue.includes(value);
          case 'not_in':
            return Array.isArray(filterValue) && !filterValue.includes(value);
          case 'is_null':
            return value === null || value === undefined;
          case 'is_not_null':
            return value !== null && value !== undefined;
          default:
            return true;
        }
      });
    });
  }

  /**
   * Apply aggregations to data
   */
  static _applyAggregations(data, aggregations, dataMapping) {
    const grouped = {};

    // Group by dimension
    const groupByField = dataMapping.x || dataMapping.category || dataMapping.dimension;

    data.forEach(row => {
      const groupKey = row[groupByField] || 'Other';
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(row);
    });

    // Apply aggregation functions
    const result = [];

    for (const [key, rows] of Object.entries(grouped)) {
      const aggregated = { [groupByField]: key };

      aggregations.forEach(agg => {
        const field = agg.field;
        const values = rows.map(r => r[field]).filter(v => v !== null && v !== undefined);

        switch (agg.function) {
          case 'sum':
            aggregated[`${field}_sum`] = values.reduce((a, b) => a + parseFloat(b), 0);
            break;
          case 'avg':
            aggregated[`${field}_avg`] = values.reduce((a, b) => a + parseFloat(b), 0) / values.length;
            break;
          case 'min':
            aggregated[`${field}_min`] = Math.min(...values.map(v => parseFloat(v)));
            break;
          case 'max':
            aggregated[`${field}_max`] = Math.max(...values.map(v => parseFloat(v)));
            break;
          case 'count':
            aggregated[`${field}_count`] = values.length;
            break;
          case 'count_distinct':
            aggregated[`${field}_count_distinct`] = new Set(values).size;
            break;
        }
      });

      result.push(aggregated);
    }

    return result;
  }

  /**
   * Render Chart.js visualization
   */
  static _renderChartJS(visualization, data) {
    const { type, dataMapping, config } = visualization;

    const chartData = {
      labels: data.map(row => row[dataMapping.x] || row[dataMapping.labels]),
      datasets: []
    };

    // Single dataset charts (bar, line, pie, etc.)
    if (['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar'].includes(type)) {
      const yFields = Array.isArray(dataMapping.y) ? dataMapping.y : [dataMapping.y];

      yFields.forEach((yField, index) => {
        chartData.datasets.push({
          label: config.labels?.[index] || yField,
          data: data.map(row => row[yField]),
          backgroundColor: config.backgroundColor?.[index] || this._getDefaultColor(index, 0.7),
          borderColor: config.borderColor?.[index] || this._getDefaultColor(index, 1),
          borderWidth: config.borderWidth || 1,
          ...config.datasetOptions
        });
      });
    }

    // Scatter and bubble charts
    if (type === 'scatter' || type === 'bubble') {
      chartData.datasets.push({
        label: config.label || 'Dataset',
        data: data.map(row => ({
          x: row[dataMapping.x],
          y: row[dataMapping.y],
          ...(type === 'bubble' && dataMapping.r ? { r: row[dataMapping.r] } : {})
        })),
        backgroundColor: config.backgroundColor || this._getDefaultColor(0, 0.5),
        borderColor: config.borderColor || this._getDefaultColor(0, 1)
      });
    }

    return {
      type,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: config.maintainAspectRatio !== false,
        plugins: {
          legend: {
            display: config.showLegend !== false,
            position: config.legendPosition || 'top'
          },
          title: {
            display: !!config.title,
            text: config.title || ''
          },
          tooltip: {
            enabled: config.showTooltips !== false
          }
        },
        scales: this._getChartScales(type, config),
        ...config.customOptions
      }
    };
  }

  /**
   * Get scales configuration for Chart.js
   */
  static _getChartScales(type, config) {
    if (['pie', 'doughnut', 'polarArea'].includes(type)) {
      return undefined;
    }

    return {
      x: {
        display: config.showXAxis !== false,
        title: {
          display: !!config.xAxisLabel,
          text: config.xAxisLabel || ''
        },
        grid: {
          display: config.showGrid !== false
        }
      },
      y: {
        display: config.showYAxis !== false,
        title: {
          display: !!config.yAxisLabel,
          text: config.yAxisLabel || ''
        },
        grid: {
          display: config.showGrid !== false
        },
        beginAtZero: config.beginAtZero !== false
      }
    };
  }

  /**
   * Render D3 visualization
   */
  static _renderD3(visualization, data) {
    const { type, dataMapping, config } = visualization;

    // D3 visualizations return data structure that client-side D3 will render
    return {
      type,
      data: data,
      mapping: dataMapping,
      config: {
        width: visualization.width || config.width || 800,
        height: visualization.height || config.height || 600,
        margin: config.margin || { top: 20, right: 20, bottom: 30, left: 40 },
        ...config
      }
    };
  }

  /**
   * Render custom visualization
   */
  static _renderCustom(visualization, data) {
    // For tables and custom views
    const { type, dataMapping, config } = visualization;

    if (type === 'table') {
      return {
        type: 'table',
        columns: config.columns || Object.keys(data[0] || {}),
        data: data,
        config: {
          sortable: config.sortable !== false,
          filterable: config.filterable !== false,
          pagination: config.pagination || { enabled: true, pageSize: 50 }
        }
      };
    }

    if (type === 'metric') {
      const value = data.length > 0 ? data[0][dataMapping.value] : 0;
      return {
        type: 'metric',
        value,
        label: config.label || dataMapping.value,
        format: config.format || 'number',
        comparison: config.comparison,
        icon: config.icon,
        color: config.color
      };
    }

    if (type === 'gauge') {
      const value = data.length > 0 ? data[0][dataMapping.value] : 0;
      return {
        type: 'gauge',
        value,
        min: config.min || 0,
        max: config.max || 100,
        thresholds: config.thresholds || [],
        label: config.label || dataMapping.value
      };
    }

    return { type, data, config };
  }

  /**
   * Get default color for chart
   */
  static _getDefaultColor(index, alpha = 1) {
    const colors = [
      `rgba(54, 162, 235, ${alpha})`,   // Blue
      `rgba(255, 99, 132, ${alpha})`,   // Red
      `rgba(75, 192, 192, ${alpha})`,   // Green
      `rgba(255, 206, 86, ${alpha})`,   // Yellow
      `rgba(153, 102, 255, ${alpha})`,  // Purple
      `rgba(255, 159, 64, ${alpha})`,   // Orange
      `rgba(199, 199, 199, ${alpha})`,  // Gray
      `rgba(83, 102, 255, ${alpha})`,   // Indigo
      `rgba(255, 99, 255, ${alpha})`,   // Pink
      `rgba(99, 255, 132, ${alpha})`    // Lime
    ];

    return colors[index % colors.length];
  }

  /**
   * Get visualization by ID
   */
  static async getById(id, options = {}) {
    const include = [];
    if (options.includeDataset) {
      include.push({ model: Dataset, as: 'dataset' });
    }

    return await Visualization.findByPk(id, { include });
  }

  /**
   * List visualizations
   */
  static async list(filters = {}) {
    const where = {};

    if (filters.type) where.type = filters.type;
    if (filters.renderer) where.renderer = filters.renderer;
    if (filters.datasetId) where.datasetId = filters.datasetId;
    if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;

    return await Visualization.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: filters.includeDataset ? [{ model: Dataset, as: 'dataset' }] : []
    });
  }

  /**
   * Update visualization
   */
  static async update(id, data, userId) {
    const visualization = await Visualization.findByPk(id);
    if (!visualization) {
      throw new Error('Visualization not found');
    }

    await visualization.update({
      ...data,
      updatedBy: userId
    });

    return visualization;
  }

  /**
   * Delete visualization
   */
  static async delete(id) {
    const visualization = await Visualization.findByPk(id);
    if (!visualization) {
      throw new Error('Visualization not found');
    }

    await visualization.destroy();
    logger.info('Visualization deleted', { visualizationId: id });
  }

  /**
   * Clone visualization
   */
  static async clone(id, userId, newName) {
    const original = await Visualization.findByPk(id);
    if (!original) {
      throw new Error('Visualization not found');
    }

    const cloned = await Visualization.create({
      datasetId: original.datasetId,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      renderer: original.renderer,
      config: original.config,
      dataMapping: original.dataMapping,
      filters: original.filters,
      aggregations: original.aggregations,
      width: original.width,
      height: original.height,
      isPublic: false,
      createdBy: userId
    });

    logger.info('Visualization cloned', {
      originalId: id,
      clonedId: cloned.id
    });

    return cloned;
  }
}

module.exports = VisualizationService;
