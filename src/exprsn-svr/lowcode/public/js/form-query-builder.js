/**
 * ═══════════════════════════════════════════════════════════
 * Visual Query Builder - Advanced Data Query System
 * Supports multiple datasources, filters, aggregations, and transformations
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // Query Builder Data Model
  const QUERY_OPERATORS = {
    // Comparison operators
    equals: { label: 'Equals', symbol: '=', types: ['string', 'number', 'date', 'boolean'] },
    notEquals: { label: 'Not Equals', symbol: '!=', types: ['string', 'number', 'date', 'boolean'] },
    greaterThan: { label: 'Greater Than', symbol: '>', types: ['number', 'date'] },
    greaterOrEqual: { label: 'Greater or Equal', symbol: '>=', types: ['number', 'date'] },
    lessThan: { label: 'Less Than', symbol: '<', types: ['number', 'date'] },
    lessOrEqual: { label: 'Less or Equal', symbol: '<=', types: ['number', 'date'] },

    // String operators
    contains: { label: 'Contains', symbol: 'LIKE', types: ['string'] },
    notContains: { label: 'Not Contains', symbol: 'NOT LIKE', types: ['string'] },
    startsWith: { label: 'Starts With', symbol: 'LIKE', types: ['string'] },
    endsWith: { label: 'Ends With', symbol: 'LIKE', types: ['string'] },

    // Array operators
    in: { label: 'In', symbol: 'IN', types: ['string', 'number'] },
    notIn: { label: 'Not In', symbol: 'NOT IN', types: ['string', 'number'] },

    // Null operators
    isNull: { label: 'Is Null', symbol: 'IS NULL', types: ['string', 'number', 'date', 'boolean'] },
    isNotNull: { label: 'Is Not Null', symbol: 'IS NOT NULL', types: ['string', 'number', 'date', 'boolean'] },

    // Boolean operators
    isTrue: { label: 'Is True', symbol: '= true', types: ['boolean'] },
    isFalse: { label: 'Is False', symbol: '= false', types: ['boolean'] }
  };

  const AGGREGATION_FUNCTIONS = {
    count: { label: 'Count', sql: 'COUNT', types: ['number', 'string', 'date', 'boolean'] },
    sum: { label: 'Sum', sql: 'SUM', types: ['number'] },
    avg: { label: 'Average', sql: 'AVG', types: ['number'] },
    min: { label: 'Minimum', sql: 'MIN', types: ['number', 'date'] },
    max: { label: 'Maximum', sql: 'MAX', types: ['number', 'date'] },
    countDistinct: { label: 'Count Distinct', sql: 'COUNT(DISTINCT', types: ['string', 'number'] },
    arrayAgg: { label: 'Array Aggregate', sql: 'ARRAY_AGG', types: ['string', 'number'] },
    jsonAgg: { label: 'JSON Aggregate', sql: 'JSON_AGG', types: ['object', 'array'] }
  };

  const DATASOURCE_TYPES = {
    entity: { label: 'Entity (Database Table)', icon: 'fa-database', color: '#0078d4' },
    forge: { label: 'Forge CRM/ERP', icon: 'fa-building', color: '#107c10' },
    database: { label: 'Database Query', icon: 'fa-server', color: '#e81123' },
    rest: { label: 'REST API', icon: 'fa-globe', color: '#881798' },
    json: { label: 'JSON File/URL', icon: 'fa-file-code', color: '#ff8c00' },
    xml: { label: 'XML File/URL', icon: 'fa-file-code', color: '#008272' },
    jsonlex: { label: 'JSONLex Expression', icon: 'fa-code', color: '#5c2d91' },
    redis: { label: 'Redis Cache', icon: 'fa-memory', color: '#dc3545' },
    variable: { label: 'Form Variable', icon: 'fa-box', color: '#00aa00' },
    custom: { label: 'Custom Code', icon: 'fa-cogs', color: '#6c757d' }
  };

  class QueryBuilderManager {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.state = window.FORM_DESIGNER_STATE;
      this.appId = this.state.appId;

      // Query state
      this.queries = this.state.queries || [];
      this.currentQuery = null;

      // Available data schemas
      this.availableEntities = [];
      this.availableForgeModules = [];
      this.availableVariables = [];

      // UI elements
      this.queryListEl = null;
      this.queryEditorEl = null;
      this.queryPreviewEl = null;

      this.init();
    }

    async init() {
      console.log('[QueryBuilder] Initializing Visual Query Builder...');

      // Load available data sources
      await this.loadAvailableDataSources();

      // Setup event listeners
      this.setupEventListeners();

      console.log('[QueryBuilder] Initialization complete');
    }

    // ═══════════════════════════════════════════════════════════
    // Data Source Loading
    // ═══════════════════════════════════════════════════════════

    async loadAvailableDataSources() {
      try {
        // Load entities
        const entitiesRes = await fetch(`/lowcode/api/entities?applicationId=${this.appId}`);
        const entitiesData = await entitiesRes.json();
        if (entitiesData.success) {
          this.availableEntities = entitiesData.data.entities || [];
          console.log('[QueryBuilder] Loaded', this.availableEntities.length, 'entities');
        }

        // Load Forge modules (if available)
        try {
          const forgeRes = await fetch(`/lowcode/api/forge/modules`);
          const forgeData = await forgeRes.json();
          if (forgeData.success) {
            this.availableForgeModules = forgeData.data || [];
            console.log('[QueryBuilder] Loaded', this.availableForgeModules.length, 'Forge modules');
          }
        } catch (err) {
          console.log('[QueryBuilder] Forge modules not available');
        }

        // Load form variables
        this.availableVariables = this.state.variables || [];
        console.log('[QueryBuilder] Loaded', this.availableVariables.length, 'variables');

      } catch (error) {
        console.error('[QueryBuilder] Failed to load data sources:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Query Management
    // ═══════════════════════════════════════════════════════════

    createQuery() {
      const query = {
        id: this.generateQueryId(),
        name: 'Untitled Query',
        description: '',

        // Data source configuration
        datasource: {
          type: 'entity', // entity, forge, database, rest, json, xml, jsonlex, redis, variable, custom
          config: {}
        },

        // Field selection
        fields: [], // Array of { name, alias, aggregation, transform }

        // Filtering
        filters: {
          condition: 'AND', // AND or OR
          rules: [] // Array of filter rules
        },

        // Grouping
        groupBy: [], // Array of field names
        having: {
          condition: 'AND',
          rules: []
        },

        // Ordering
        orderBy: [], // Array of { field, direction: 'ASC'|'DESC' }

        // Pagination
        limit: 100,
        offset: 0,
        enablePagination: true,
        pageSize: 20,

        // Advanced options
        distinct: false,
        enableCache: false,
        cacheDuration: 300, // seconds
        timeout: 30, // seconds

        // Variables and parameters
        parameters: [], // Array of { name, type, defaultValue, required }
        variables: {}, // Mapping to form variables

        // Output configuration
        outputFormat: 'json', // json, csv, xml
        transformScript: '', // JSONLex transformation

        // Metadata
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.queries.push(query);
      this.state.queries = this.queries;
      this.currentQuery = query;

      console.log('[QueryBuilder] Created new query:', query.id);
      return query;
    }

    deleteQuery(queryId) {
      const index = this.queries.findIndex(q => q.id === queryId);
      if (index !== -1) {
        this.queries.splice(index, 1);
        this.state.queries = this.queries;

        if (this.currentQuery && this.currentQuery.id === queryId) {
          this.currentQuery = null;
        }

        console.log('[QueryBuilder] Deleted query:', queryId);
        this.renderQueryList();
      }
    }

    duplicateQuery(queryId) {
      const query = this.queries.find(q => q.id === queryId);
      if (query) {
        const duplicate = JSON.parse(JSON.stringify(query));
        duplicate.id = this.generateQueryId();
        duplicate.name = query.name + ' (Copy)';
        duplicate.createdAt = new Date().toISOString();
        duplicate.updatedAt = new Date().toISOString();

        this.queries.push(duplicate);
        this.state.queries = this.queries;

        console.log('[QueryBuilder] Duplicated query:', queryId);
        this.renderQueryList();
      }
    }

    updateQuery(queryId, updates) {
      const query = this.queries.find(q => q.id === queryId);
      if (query) {
        Object.assign(query, updates);
        query.updatedAt = new Date().toISOString();
        this.state.queries = this.queries;
        this.state.isDirty = true;

        console.log('[QueryBuilder] Updated query:', queryId);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Filter Management
    // ═══════════════════════════════════════════════════════════

    addFilter(queryId, parentGroup = null) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query) return;

      const filter = {
        id: this.generateFilterId(),
        field: '',
        operator: 'equals',
        value: '',
        valueType: 'static', // static, variable, parameter, field
        valueSource: '' // Variable name, parameter name, or field name
      };

      const targetGroup = parentGroup || query.filters;
      targetGroup.rules.push(filter);

      this.updateQuery(queryId, {});
      this.renderFilterBuilder(query);
    }

    addFilterGroup(queryId, parentGroup = null) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query) return;

      const group = {
        id: this.generateFilterId(),
        type: 'group',
        condition: 'AND',
        rules: []
      };

      const targetGroup = parentGroup || query.filters;
      targetGroup.rules.push(group);

      this.updateQuery(queryId, {});
      this.renderFilterBuilder(query);
    }

    removeFilter(queryId, filterId, parentGroup = null) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query) return;

      const removeFromGroup = (group) => {
        const index = group.rules.findIndex(r => r.id === filterId);
        if (index !== -1) {
          group.rules.splice(index, 1);
          return true;
        }

        for (const rule of group.rules) {
          if (rule.type === 'group' && removeFromGroup(rule)) {
            return true;
          }
        }
        return false;
      };

      removeFromGroup(parentGroup || query.filters);
      this.updateQuery(queryId, {});
      this.renderFilterBuilder(query);
    }

    // ═══════════════════════════════════════════════════════════
    // Aggregation Management
    // ═══════════════════════════════════════════════════════════

    addAggregation(queryId) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query) return;

      const agg = {
        id: this.generateAggregationId(),
        field: '',
        function: 'count',
        alias: ''
      };

      if (!query.aggregations) {
        query.aggregations = [];
      }

      query.aggregations.push(agg);
      this.updateQuery(queryId, {});
      this.renderAggregationBuilder(query);
    }

    removeAggregation(queryId, aggId) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query || !query.aggregations) return;

      const index = query.aggregations.findIndex(a => a.id === aggId);
      if (index !== -1) {
        query.aggregations.splice(index, 1);
        this.updateQuery(queryId, {});
        this.renderAggregationBuilder(query);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Query Execution
    // ═══════════════════════════════════════════════════════════

    async executeQuery(queryId, options = {}) {
      const query = this.queries.find(q => q.id === queryId);
      if (!query) {
        console.error('[QueryBuilder] Query not found:', queryId);
        return null;
      }

      console.log('[QueryBuilder] Executing query:', query.name);

      try {
        const response = await fetch('/lowcode/api/query/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: query,
            options: options,
            context: {
              formId: this.state.formId,
              appId: this.appId,
              variables: this.getVariableValues(),
              user: window.CURRENT_USER || {}
            }
          })
        });

        const result = await response.json();

        if (result.success) {
          console.log('[QueryBuilder] Query executed successfully:', result.data.rowCount, 'rows');
          return result.data;
        } else {
          console.error('[QueryBuilder] Query execution failed:', result.error);
          throw new Error(result.error || 'Query execution failed');
        }

      } catch (error) {
        console.error('[QueryBuilder] Error executing query:', error);
        throw error;
      }
    }

    async testQuery(queryId) {
      try {
        const result = await this.executeQuery(queryId, { limit: 10, preview: true });
        this.renderQueryResults(result);
        return result;
      } catch (error) {
        this.showError('Query Test Failed', error.message);
        return null;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Query Generation
    // ═══════════════════════════════════════════════════════════

    generateSQL(query) {
      if (!query) return '';

      let sql = '';

      // SELECT clause
      if (query.fields && query.fields.length > 0) {
        const fieldList = query.fields.map(f => {
          let fieldStr = f.aggregation
            ? `${AGGREGATION_FUNCTIONS[f.aggregation].sql}(${f.name})`
            : f.name;

          if (f.alias) {
            fieldStr += ` AS ${f.alias}`;
          }

          return fieldStr;
        }).join(', ');

        sql += query.distinct ? 'SELECT DISTINCT ' : 'SELECT ';
        sql += fieldList;
      } else {
        sql += 'SELECT *';
      }

      // FROM clause
      sql += `\nFROM ${this.getTableName(query.datasource)}`;

      // WHERE clause
      if (query.filters && query.filters.rules.length > 0) {
        sql += '\nWHERE ' + this.generateFilterSQL(query.filters);
      }

      // GROUP BY clause
      if (query.groupBy && query.groupBy.length > 0) {
        sql += '\nGROUP BY ' + query.groupBy.join(', ');
      }

      // HAVING clause
      if (query.having && query.having.rules.length > 0) {
        sql += '\nHAVING ' + this.generateFilterSQL(query.having);
      }

      // ORDER BY clause
      if (query.orderBy && query.orderBy.length > 0) {
        const orderList = query.orderBy.map(o => `${o.field} ${o.direction}`).join(', ');
        sql += '\nORDER BY ' + orderList;
      }

      // LIMIT clause
      if (query.limit) {
        sql += `\nLIMIT ${query.limit}`;
      }

      // OFFSET clause
      if (query.offset) {
        sql += `\nOFFSET ${query.offset}`;
      }

      return sql;
    }

    generateFilterSQL(filterGroup) {
      const rules = filterGroup.rules.map(rule => {
        if (rule.type === 'group') {
          return '(' + this.generateFilterSQL(rule) + ')';
        }

        const operator = QUERY_OPERATORS[rule.operator];
        let value = this.formatFilterValue(rule);

        switch (rule.operator) {
          case 'isNull':
          case 'isNotNull':
            return `${rule.field} ${operator.symbol}`;
          case 'contains':
            return `${rule.field} LIKE '%${value}%'`;
          case 'startsWith':
            return `${rule.field} LIKE '${value}%'`;
          case 'endsWith':
            return `${rule.field} LIKE '%${value}'`;
          case 'in':
          case 'notIn':
            return `${rule.field} ${operator.symbol} (${value})`;
          default:
            return `${rule.field} ${operator.symbol} ${value}`;
        }
      });

      return rules.join(` ${filterGroup.condition} `);
    }

    formatFilterValue(filter) {
      if (filter.valueType === 'variable') {
        const variable = this.state.variables.find(v => v.name === filter.valueSource);
        return variable ? variable.value : "''";
      } else if (filter.valueType === 'parameter') {
        return `$${filter.valueSource}`;
      } else if (filter.valueType === 'field') {
        return filter.valueSource;
      } else {
        // Static value - escape for SQL
        if (typeof filter.value === 'string') {
          return `'${filter.value.replace(/'/g, "''")}'`;
        }
        return filter.value;
      }
    }

    getTableName(datasource) {
      switch (datasource.type) {
        case 'entity':
          return datasource.config.entityName || datasource.config.entityId;
        case 'forge':
          return datasource.config.module;
        case 'database':
          return datasource.config.table;
        default:
          return 'unknown_table';
      }
    }

    // ═══════════════════════════════════════════════════════════
    // Helper Methods
    // ═══════════════════════════════════════════════════════════

    getVariableValues() {
      const values = {};
      if (this.state.variables) {
        this.state.variables.forEach(v => {
          values[v.name] = v.value;
        });
      }
      return values;
    }

    generateQueryId() {
      return 'query_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateFilterId() {
      return 'filter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateAggregationId() {
      return 'agg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    showError(title, message) {
      // TODO: Integrate with form designer notification system
      alert(`${title}: ${message}`);
    }

    // ═══════════════════════════════════════════════════════════
    // Event Handlers
    // ═══════════════════════════════════════════════════════════

    setupEventListeners() {
      // Event listeners will be set up when rendering UI
      console.log('[QueryBuilder] Event listeners ready');
    }

    // Render methods will be implemented in the UI module
    renderQueryList() {
      console.log('[QueryBuilder] Rendering query list...');
    }

    renderFilterBuilder(query) {
      console.log('[QueryBuilder] Rendering filter builder for query:', query.id);
    }

    renderAggregationBuilder(query) {
      console.log('[QueryBuilder] Rendering aggregation builder for query:', query.id);
    }

    renderQueryResults(results) {
      console.log('[QueryBuilder] Rendering query results:', results);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════════════════════

  window.QueryBuilderManager = QueryBuilderManager;
  window.QUERY_OPERATORS = QUERY_OPERATORS;
  window.AGGREGATION_FUNCTIONS = AGGREGATION_FUNCTIONS;
  window.DATASOURCE_TYPES = DATASOURCE_TYPES;

  console.log('[QueryBuilder] Module loaded');

})();
