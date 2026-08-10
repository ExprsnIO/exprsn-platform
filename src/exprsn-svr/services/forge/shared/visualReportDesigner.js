/**
 * Visual Report Designer Service
 * Manages drag-and-drop report design with visual workflows
 */

const { v4: uuidv4 } = require('uuid');
const reportVariableService = require('./reportVariableService');
const reportQueryBuilder = require('./reportQueryBuilder');
const logger = require('../../../utils/logger');

class VisualReportDesigner {
  constructor() {
    // Element types that can be dragged onto canvas
    this.elementTypes = {
      // Data Elements
      DATA_SOURCE: 'data_source',           // Database table/view
      FIELD: 'field',                       // Column/field selection
      FILTER: 'filter',                     // Filter condition
      AGGREGATION: 'aggregation',           // Aggregation (SUM, COUNT, etc.)
      CALCULATED_FIELD: 'calculated_field', // Custom calculation
      PARAMETER: 'parameter',               // User parameter

      // Transformation Elements
      JOIN: 'join',                         // Table join
      UNION: 'union',                       // Union operation
      CROSS_TAB: 'cross_tab',              // Pivot/cross-tabulation
      GROUP_BY: 'group_by',                // Grouping
      SORT: 'sort',                        // Sorting

      // Visualization Elements
      CHART: 'chart',                       // Chart visualization
      TABLE: 'table',                       // Data table
      KPI: 'kpi',                          // KPI card
      TEXT: 'text',                        // Text box
      IMAGE: 'image',                      // Image element
      CONTAINER: 'container',              // Layout container

      // Control Elements
      DATE_PICKER: 'date_picker',          // Date range selector
      DROPDOWN: 'dropdown',                // Dropdown filter
      CHECKBOX: 'checkbox',                // Checkbox filter
      SLIDER: 'slider',                    // Range slider
      BUTTON: 'button'                     // Action button
    };

    // Chart types supported
    this.chartTypes = {
      // Standard Charts
      BAR: 'bar',
      COLUMN: 'column',
      LINE: 'line',
      AREA: 'area',
      PIE: 'pie',
      DONUT: 'donut',
      SCATTER: 'scatter',
      BUBBLE: 'bubble',

      // Complex Charts
      STACKED_BAR: 'stacked_bar',
      STACKED_COLUMN: 'stacked_column',
      STACKED_AREA: 'stacked_area',
      GROUPED_BAR: 'grouped_bar',
      GROUPED_COLUMN: 'grouped_column',
      COMBO: 'combo',                      // Line + Bar combo
      WATERFALL: 'waterfall',
      FUNNEL: 'funnel',
      GAUGE: 'gauge',
      RADAR: 'radar',
      POLAR: 'polar',
      TREEMAP: 'treemap',
      SUNBURST: 'sunburst',
      HEATMAP: 'heatmap',
      CANDLESTICK: 'candlestick',
      SANKEY: 'sankey',
      BOXPLOT: 'boxplot'
    };

    // Join types
    this.joinTypes = {
      INNER: 'inner',
      LEFT: 'left',
      RIGHT: 'right',
      FULL: 'full',
      CROSS: 'cross'
    };

    // Active designs (in production, store in database)
    this.designs = new Map();
  }

  /**
   * Create a new visual report design
   */
  async createDesign(designData, userId) {
    const design = {
      id: uuidv4(),
      name: designData.name,
      description: designData.description || '',
      module: designData.module, // crm, erp, groupware
      category: designData.category || 'custom',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,

      // Canvas configuration
      canvas: {
        width: designData.canvas?.width || 1200,
        height: designData.canvas?.height || 800,
        backgroundColor: designData.canvas?.backgroundColor || '#ffffff',
        gridSize: designData.canvas?.gridSize || 10,
        snapToGrid: designData.canvas?.snapToGrid !== false
      },

      // Elements on the canvas
      elements: [],

      // Connections between elements
      connections: [],

      // Data flow configuration
      dataFlow: {
        dataSources: [],
        transformations: [],
        outputs: []
      },

      // Parameters (like Power Query)
      parameters: {},

      // Layout and styling
      layout: {
        type: designData.layout?.type || 'free', // free, grid, flow
        columns: designData.layout?.columns || 12,
        rows: designData.layout?.rows || 'auto'
      },

      // Theme and colors
      theme: {
        colorPalette: designData.theme?.colorPalette || [
          '#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC',
          '#00ACC1', '#FF7043', '#9E9D24', '#5C6BC0', '#F06292'
        ],
        fontFamily: designData.theme?.fontFamily || 'Inter, sans-serif',
        fontSize: designData.theme?.fontSize || 14
      },

      // Refresh settings
      refresh: {
        enabled: designData.refresh?.enabled || false,
        interval: designData.refresh?.interval || 60000, // ms
        prefetch: designData.refresh?.prefetch || false
      }
    };

    this.designs.set(design.id, design);

    logger.info('Created visual report design', { designId: design.id, userId });

    return design;
  }

  /**
   * Add element to design canvas
   */
  async addElement(designId, elementData, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (design.createdBy !== userId) {
      throw new Error('Unauthorized to modify this design');
    }

    const element = {
      id: uuidv4(),
      type: elementData.type,
      label: elementData.label || this.getDefaultLabel(elementData.type),

      // Position on canvas
      position: {
        x: elementData.position?.x || 0,
        y: elementData.position?.y || 0,
        z: elementData.position?.z || 0 // Layer order
      },

      // Size
      size: {
        width: elementData.size?.width || 200,
        height: elementData.size?.height || 150
      },

      // Styling
      style: {
        backgroundColor: elementData.style?.backgroundColor || '#ffffff',
        borderColor: elementData.style?.borderColor || '#e0e0e0',
        borderWidth: elementData.style?.borderWidth || 1,
        borderRadius: elementData.style?.borderRadius || 4,
        color: elementData.style?.color || '#333333',
        fontSize: elementData.style?.fontSize || 14,
        fontWeight: elementData.style?.fontWeight || 'normal',
        padding: elementData.style?.padding || 16,
        shadow: elementData.style?.shadow || 'none'
      },

      // Element-specific configuration
      config: elementData.config || {},

      // Data binding
      dataBinding: elementData.dataBinding || null,

      // Interactivity
      interactive: elementData.interactive !== false,
      clickable: elementData.clickable || false,
      draggable: elementData.draggable !== false,
      resizable: elementData.resizable !== false,

      // Connections
      inputs: [], // Element IDs that connect to this element
      outputs: [], // Element IDs this element connects to

      createdAt: new Date().toISOString()
    };

    design.elements.push(element);
    design.updatedAt = new Date().toISOString();
    design.version++;

    this.designs.set(designId, design);

    logger.info('Added element to design', { designId, elementId: element.id, type: element.type });

    return element;
  }

  /**
   * Update element
   */
  async updateElement(designId, elementId, updates, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (design.createdBy !== userId) {
      throw new Error('Unauthorized to modify this design');
    }

    const elementIndex = design.elements.findIndex(el => el.id === elementId);

    if (elementIndex === -1) {
      throw new Error('Element not found');
    }

    // Deep merge updates
    design.elements[elementIndex] = {
      ...design.elements[elementIndex],
      ...updates,
      id: elementId, // Preserve ID
      position: { ...design.elements[elementIndex].position, ...(updates.position || {}) },
      size: { ...design.elements[elementIndex].size, ...(updates.size || {}) },
      style: { ...design.elements[elementIndex].style, ...(updates.style || {}) },
      config: { ...design.elements[elementIndex].config, ...(updates.config || {}) }
    };

    design.updatedAt = new Date().toISOString();
    design.version++;

    this.designs.set(designId, design);

    return design.elements[elementIndex];
  }

  /**
   * Delete element
   */
  async deleteElement(designId, elementId, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (design.createdBy !== userId) {
      throw new Error('Unauthorized to modify this design');
    }

    // Remove element
    design.elements = design.elements.filter(el => el.id !== elementId);

    // Remove connections involving this element
    design.connections = design.connections.filter(
      conn => conn.sourceId !== elementId && conn.targetId !== elementId
    );

    design.updatedAt = new Date().toISOString();
    design.version++;

    this.designs.set(designId, design);

    return { success: true };
  }

  /**
   * Connect two elements
   */
  async connectElements(designId, sourceId, targetId, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (design.createdBy !== userId) {
      throw new Error('Unauthorized to modify this design');
    }

    const sourceElement = design.elements.find(el => el.id === sourceId);
    const targetElement = design.elements.find(el => el.id === targetId);

    if (!sourceElement || !targetElement) {
      throw new Error('Source or target element not found');
    }

    const connection = {
      id: uuidv4(),
      sourceId,
      targetId,
      type: 'data_flow', // data_flow, control_flow
      style: {
        lineColor: '#666666',
        lineWidth: 2,
        lineStyle: 'solid' // solid, dashed, dotted
      },
      createdAt: new Date().toISOString()
    };

    design.connections.push(connection);

    // Update element connections
    sourceElement.outputs.push(targetId);
    targetElement.inputs.push(sourceId);

    design.updatedAt = new Date().toISOString();
    design.version++;

    this.designs.set(designId, design);

    return connection;
  }

  /**
   * Add data source element
   */
  async addDataSource(designId, dataSourceConfig, userId) {
    const element = await this.addElement(designId, {
      type: this.elementTypes.DATA_SOURCE,
      label: dataSourceConfig.tableName || 'Data Source',
      config: {
        type: dataSourceConfig.type || 'table', // table, view, query, api
        tableName: dataSourceConfig.tableName,
        schema: dataSourceConfig.schema || 'public',
        columns: dataSourceConfig.columns || [],
        query: dataSourceConfig.query || null
      },
      position: dataSourceConfig.position,
      size: { width: 250, height: 200 }
    }, userId);

    return element;
  }

  /**
   * Add join element
   */
  async addJoin(designId, joinConfig, userId) {
    const element = await this.addElement(designId, {
      type: this.elementTypes.JOIN,
      label: `${joinConfig.joinType.toUpperCase()} Join`,
      config: {
        joinType: joinConfig.joinType || this.joinTypes.INNER,
        leftTable: joinConfig.leftTable,
        rightTable: joinConfig.rightTable,
        conditions: joinConfig.conditions || [], // Array of { leftColumn, rightColumn, operator }
        matchTypes: joinConfig.matchTypes !== false // Match column types
      },
      position: joinConfig.position,
      size: { width: 200, height: 150 },
      style: {
        backgroundColor: this.getJoinColor(joinConfig.joinType)
      }
    }, userId);

    return element;
  }

  /**
   * Add cross-tab element
   */
  async addCrossTab(designId, crossTabConfig, userId) {
    const element = await this.addElement(designId, {
      type: this.elementTypes.CROSS_TAB,
      label: 'Cross-Tab / Pivot',
      config: {
        rows: crossTabConfig.rows || [],           // Fields for rows
        columns: crossTabConfig.columns || [],     // Fields for columns
        values: crossTabConfig.values || [],       // Measures to aggregate
        aggregations: crossTabConfig.aggregations || { count: 'COUNT' },
        showTotals: crossTabConfig.showTotals !== false,
        showGrandTotals: crossTabConfig.showGrandTotals !== false
      },
      position: crossTabConfig.position,
      size: { width: 300, height: 250 }
    }, userId);

    return element;
  }

  /**
   * Add chart visualization
   */
  async addChart(designId, chartConfig, userId) {
    const element = await this.addElement(designId, {
      type: this.elementTypes.CHART,
      label: chartConfig.title || 'Chart',
      config: {
        chartType: chartConfig.chartType || this.chartTypes.BAR,

        // Data configuration
        xAxis: chartConfig.xAxis, // Field for X-axis
        yAxis: chartConfig.yAxis, // Field(s) for Y-axis (can be array for multi-series)
        series: chartConfig.series || null, // Grouping field for multiple series

        // Chart.js options
        chartOptions: {
          responsive: true,
          maintainAspectRatio: false,

          // Colors
          colors: chartConfig.colors || null, // Custom color array

          // Title
          plugins: {
            title: {
              display: chartConfig.showTitle !== false,
              text: chartConfig.title || '',
              font: { size: 16, weight: 'bold' }
            },
            legend: {
              display: chartConfig.showLegend !== false,
              position: chartConfig.legendPosition || 'top'
            },
            tooltip: {
              enabled: chartConfig.showTooltip !== false,
              backgroundColor: 'rgba(0,0,0,0.8)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff'
            }
          },

          // Axes
          scales: chartConfig.scales || this.getDefaultScales(chartConfig.chartType),

          // Animation
          animation: {
            duration: chartConfig.animationDuration || 750,
            easing: chartConfig.animationEasing || 'easeInOutQuart'
          }
        },

        // Real-time refresh
        realtime: {
          enabled: chartConfig.realtime?.enabled || false,
          interval: chartConfig.realtime?.interval || 5000,
          prefetch: chartConfig.realtime?.prefetch || false
        },

        // Interactions
        onClick: chartConfig.onClick || null,
        onHover: chartConfig.onHover || null
      },
      position: chartConfig.position,
      size: chartConfig.size || { width: 500, height: 400 },
      style: {
        backgroundColor: chartConfig.backgroundColor || '#ffffff',
        borderColor: chartConfig.borderColor || '#e0e0e0'
      }
    }, userId);

    return element;
  }

  /**
   * Add parameter (Power Query style)
   */
  async addParameter(designId, parameterConfig, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    const parameter = {
      id: uuidv4(),
      name: parameterConfig.name,
      label: parameterConfig.label || parameterConfig.name,
      type: parameterConfig.type, // text, number, date, list, query
      dataType: parameterConfig.dataType || 'string', // string, number, date, boolean

      // Value configuration
      defaultValue: parameterConfig.defaultValue,
      currentValue: parameterConfig.currentValue || parameterConfig.defaultValue,
      allowedValues: parameterConfig.allowedValues || null, // Array of allowed values

      // Validation
      required: parameterConfig.required !== false,
      validation: parameterConfig.validation || null,

      // Query-based parameters
      query: parameterConfig.query || null, // SQL query to populate values

      // Storage
      storeInCache: parameterConfig.storeInCache !== false,
      ttl: parameterConfig.ttl || 3600,

      createdAt: new Date().toISOString()
    };

    design.parameters[parameter.name] = parameter;
    design.updatedAt = new Date().toISOString();

    this.designs.set(designId, design);

    logger.info('Added parameter to design', { designId, parameterName: parameter.name });

    return parameter;
  }

  /**
   * Set parameter value
   */
  async setParameterValue(designId, parameterName, value, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (!design.parameters[parameterName]) {
      throw new Error('Parameter not found');
    }

    design.parameters[parameterName].currentValue = value;
    design.updatedAt = new Date().toISOString();

    this.designs.set(designId, design);

    return design.parameters[parameterName];
  }

  /**
   * Build executable query from visual design
   */
  async buildQuery(designId, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    // Trace data flow from sources to outputs
    const dataFlow = this.traceDataFlow(design);

    // Build query configuration
    const queryConfig = {
      from: null,
      joins: [],
      filters: [],
      groupBy: [],
      aggregations: [],
      orderBy: [],
      limit: null,
      offset: null
    };

    // Process data sources
    const dataSources = design.elements.filter(el => el.type === this.elementTypes.DATA_SOURCE);
    if (dataSources.length > 0) {
      queryConfig.from = {
        table: dataSources[0].config.tableName,
        schema: dataSources[0].config.schema,
        alias: 't1'
      };
    }

    // Process joins
    const joins = design.elements.filter(el => el.type === this.elementTypes.JOIN);
    for (const joinElement of joins) {
      queryConfig.joins.push({
        type: joinElement.config.joinType,
        table: joinElement.config.rightTable,
        conditions: joinElement.config.conditions
      });
    }

    // Process filters
    const filters = design.elements.filter(el => el.type === this.elementTypes.FILTER);
    for (const filterElement of filters) {
      queryConfig.filters.push(filterElement.config);
    }

    // Process aggregations
    const aggregations = design.elements.filter(el => el.type === this.elementTypes.AGGREGATION);
    for (const aggElement of aggregations) {
      queryConfig.aggregations.push(aggElement.config);
    }

    // Build final query
    const query = reportQueryBuilder.buildQuery(queryConfig);

    return {
      designId,
      query,
      queryConfig,
      dataFlow
    };
  }

  /**
   * Trace data flow through design
   */
  traceDataFlow(design) {
    const flow = {
      sources: [],
      transformations: [],
      visualizations: []
    };

    // Find all data sources (no inputs)
    const sources = design.elements.filter(el =>
      el.type === this.elementTypes.DATA_SOURCE && el.inputs.length === 0
    );

    for (const source of sources) {
      const path = this.traceFromElement(design, source.id, []);
      flow.sources.push({
        element: source,
        path
      });
    }

    return flow;
  }

  /**
   * Trace path from element
   */
  traceFromElement(design, elementId, visited = []) {
    if (visited.includes(elementId)) {
      return []; // Prevent circular references
    }

    visited.push(elementId);

    const element = design.elements.find(el => el.id === elementId);
    if (!element) {
      return [];
    }

    const path = [element];

    for (const outputId of element.outputs) {
      const subPath = this.traceFromElement(design, outputId, [...visited]);
      path.push(...subPath);
    }

    return path;
  }

  /**
   * Get default label for element type
   */
  getDefaultLabel(type) {
    const labels = {
      [this.elementTypes.DATA_SOURCE]: 'Data Source',
      [this.elementTypes.FIELD]: 'Field',
      [this.elementTypes.FILTER]: 'Filter',
      [this.elementTypes.AGGREGATION]: 'Aggregation',
      [this.elementTypes.JOIN]: 'Join',
      [this.elementTypes.CROSS_TAB]: 'Cross-Tab',
      [this.elementTypes.CHART]: 'Chart',
      [this.elementTypes.TABLE]: 'Table',
      [this.elementTypes.KPI]: 'KPI'
    };

    return labels[type] || type;
  }

  /**
   * Get color for join type
   */
  getJoinColor(joinType) {
    const colors = {
      [this.joinTypes.INNER]: '#4285F4',
      [this.joinTypes.LEFT]: '#DB4437',
      [this.joinTypes.RIGHT]: '#F4B400',
      [this.joinTypes.FULL]: '#0F9D58',
      [this.joinTypes.CROSS]: '#AB47BC'
    };

    return colors[joinType] || '#999999';
  }

  /**
   * Get default scales for chart type
   */
  getDefaultScales(chartType) {
    const linearScale = {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.1)' }
      },
      x: {
        grid: { display: false }
      }
    };

    const noScales = {};

    const scaleMap = {
      [this.chartTypes.PIE]: noScales,
      [this.chartTypes.DONUT]: noScales,
      [this.chartTypes.RADAR]: noScales,
      [this.chartTypes.POLAR]: noScales
    };

    return scaleMap[chartType] || linearScale;
  }

  /**
   * Get design
   */
  getDesign(designId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    return design;
  }

  /**
   * List designs
   */
  listDesigns(filters = {}) {
    const { userId, module, category } = filters;

    let designs = Array.from(this.designs.values());

    if (userId) {
      designs = designs.filter(d => d.createdBy === userId);
    }

    if (module) {
      designs = designs.filter(d => d.module === module);
    }

    if (category) {
      designs = designs.filter(d => d.category === category);
    }

    return designs;
  }

  /**
   * Delete design
   */
  async deleteDesign(designId, userId) {
    const design = this.designs.get(designId);

    if (!design) {
      throw new Error('Design not found');
    }

    if (design.createdBy !== userId) {
      throw new Error('Unauthorized to delete this design');
    }

    this.designs.delete(designId);

    logger.info('Deleted visual report design', { designId, userId });

    return { success: true };
  }
}

module.exports = new VisualReportDesigner();
