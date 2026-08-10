/**
 * Report Query Builder Service
 * Provides utilities for building complex database queries for reports
 */

const { Op } = require('sequelize');
const logger = require('../../../utils/logger');

class ReportQueryBuilder {
  constructor() {
    // Supported filter operators
    this.operators = {
      eq: Op.eq,               // Equal
      ne: Op.ne,               // Not equal
      neq: Op.ne,              // Not equal (alias)
      gt: Op.gt,               // Greater than
      gte: Op.gte,             // Greater than or equal
      lt: Op.lt,               // Less than
      lte: Op.lte,             // Less than or equal
      between: Op.between,     // Between (requires array)
      notBetween: Op.notBetween, // Not between
      in: Op.in,               // In array
      notIn: Op.notIn,         // Not in array
      like: Op.like,           // LIKE (case sensitive)
      iLike: Op.iLike,         // ILIKE (case insensitive)
      notLike: Op.notLike,     // NOT LIKE
      startsWith: Op.startsWith, // Starts with
      endsWith: Op.endsWith,   // Ends with
      substring: Op.substring, // Contains substring
      regexp: Op.regexp,       // Regular expression
      notRegexp: Op.notRegexp, // Not regular expression
      iRegexp: Op.iRegexp,     // Case insensitive regex
      is: Op.is,               // IS NULL/TRUE/FALSE
      isNot: Op.isNot,         // IS NOT
      or: Op.or,               // OR condition
      and: Op.and              // AND condition
    };

    // Aggregation functions
    this.aggregations = {
      count: 'COUNT',
      sum: 'SUM',
      avg: 'AVG',
      min: 'MIN',
      max: 'MAX'
    };

    // Sort directions
    this.sortDirections = ['ASC', 'DESC', 'asc', 'desc'];
  }

  /**
   * Build a complete query configuration from report filters
   */
  buildQuery(config = {}) {
    const query = {};

    // Build WHERE clause
    if (config.filters) {
      query.where = this.buildWhereClause(config.filters);
    }

    // Build ORDER clause
    if (config.sorting) {
      query.order = this.buildOrderClause(config.sorting);
    }

    // Build LIMIT and OFFSET
    if (config.pagination) {
      const { limit, offset, page, pageSize } = config.pagination;

      if (limit !== undefined) {
        query.limit = parseInt(limit, 10);
      } else if (pageSize !== undefined) {
        query.limit = parseInt(pageSize, 10);
      }

      if (offset !== undefined) {
        query.offset = parseInt(offset, 10);
      } else if (page !== undefined && query.limit) {
        query.offset = (parseInt(page, 10) - 1) * query.limit;
      }
    }

    // Build GROUP BY
    if (config.groupBy) {
      query.group = this.buildGroupByClause(config.groupBy);
    }

    // Build HAVING (for grouped queries)
    if (config.having) {
      query.having = this.buildWhereClause(config.having);
    }

    // Build ATTRIBUTES (SELECT)
    if (config.attributes) {
      query.attributes = this.buildAttributesClause(config.attributes);
    }

    // Build INCLUDE (JOINs)
    if (config.includes) {
      query.include = this.buildIncludeClause(config.includes);
    }

    // Build DISTINCT
    if (config.distinct) {
      query.distinct = true;
      if (typeof config.distinct === 'string') {
        query.col = config.distinct;
      }
    }

    return query;
  }

  /**
   * Build WHERE clause from filter definition
   */
  buildWhereClause(filters) {
    if (!filters || typeof filters !== 'object') {
      return {};
    }

    // Handle array of filter groups (OR conditions)
    if (Array.isArray(filters)) {
      return {
        [Op.or]: filters.map(filterGroup => this.buildWhereClause(filterGroup))
      };
    }

    const where = {};

    for (const [field, condition] of Object.entries(filters)) {
      // Handle logical operators (AND, OR)
      if (field === '$and' || field === 'and') {
        where[Op.and] = Array.isArray(condition)
          ? condition.map(c => this.buildWhereClause(c))
          : this.buildWhereClause(condition);
        continue;
      }

      if (field === '$or' || field === 'or') {
        where[Op.or] = Array.isArray(condition)
          ? condition.map(c => this.buildWhereClause(c))
          : this.buildWhereClause(condition);
        continue;
      }

      // Handle operator-based conditions
      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        where[field] = this.buildFieldCondition(condition);
      } else {
        // Direct value (equals)
        where[field] = condition;
      }
    }

    return where;
  }

  /**
   * Build condition for a single field
   */
  buildFieldCondition(condition) {
    const fieldCondition = {};

    for (const [operator, value] of Object.entries(condition)) {
      const opKey = operator.replace(/^\$/, ''); // Remove $ prefix if present

      if (this.operators[opKey]) {
        fieldCondition[this.operators[opKey]] = value;
      } else {
        logger.warn('Unknown operator in query builder', { operator });
      }
    }

    return fieldCondition;
  }

  /**
   * Build ORDER BY clause
   */
  buildOrderClause(sorting) {
    if (!sorting) {
      return [];
    }

    // Handle array format: [['field', 'DESC'], ['field2', 'ASC']]
    if (Array.isArray(sorting)) {
      return sorting.map(sort => {
        if (Array.isArray(sort)) {
          return sort;
        }
        // Handle object format: { field: 'DESC' }
        if (typeof sort === 'object') {
          return Object.entries(sort)[0];
        }
        // Handle string format: 'field' or '-field'
        if (typeof sort === 'string') {
          return sort.startsWith('-')
            ? [sort.substring(1), 'DESC']
            : [sort, 'ASC'];
        }
        return sort;
      });
    }

    // Handle object format: { field: 'DESC', field2: 'ASC' }
    if (typeof sorting === 'object') {
      return Object.entries(sorting).map(([field, direction]) => {
        const dir = (direction || 'ASC').toUpperCase();
        return [field, this.sortDirections.includes(dir) ? dir : 'ASC'];
      });
    }

    // Handle string format: 'field' or '-field'
    if (typeof sorting === 'string') {
      return sorting.startsWith('-')
        ? [[sorting.substring(1), 'DESC']]
        : [[sorting, 'ASC']];
    }

    return [];
  }

  /**
   * Build GROUP BY clause
   */
  buildGroupByClause(groupBy) {
    if (Array.isArray(groupBy)) {
      return groupBy;
    }

    if (typeof groupBy === 'string') {
      return [groupBy];
    }

    return [];
  }

  /**
   * Build ATTRIBUTES (SELECT) clause
   */
  buildAttributesClause(attributes) {
    if (!attributes) {
      return undefined;
    }

    // Simple array of field names
    if (Array.isArray(attributes) && attributes.every(attr => typeof attr === 'string')) {
      return attributes;
    }

    // Complex attributes with aggregations
    if (Array.isArray(attributes)) {
      return attributes.map(attr => {
        if (typeof attr === 'string') {
          return attr;
        }

        // Handle aggregation: { field: 'total', aggregation: 'sum', sourceField: 'amount' }
        if (attr.aggregation) {
          const aggFunc = this.aggregations[attr.aggregation.toLowerCase()];
          if (aggFunc) {
            return [
              require('sequelize').fn(aggFunc, require('sequelize').col(attr.sourceField || attr.field)),
              attr.field
            ];
          }
        }

        // Handle literal SQL
        if (attr.literal) {
          return require('sequelize').literal(attr.literal);
        }

        return attr.field || attr;
      });
    }

    // Object format: include/exclude
    if (typeof attributes === 'object') {
      if (attributes.include) {
        return { include: attributes.include };
      }
      if (attributes.exclude) {
        return { exclude: attributes.exclude };
      }
    }

    return attributes;
  }

  /**
   * Build INCLUDE (JOIN) clause
   */
  buildIncludeClause(includes) {
    if (!Array.isArray(includes)) {
      return [];
    }

    return includes.map(include => {
      if (typeof include === 'string') {
        // Simple association name
        return { association: include };
      }

      const includeConfig = {
        association: include.association || include.model
      };

      // Add nested where conditions
      if (include.where) {
        includeConfig.where = this.buildWhereClause(include.where);
      }

      // Add attributes
      if (include.attributes) {
        includeConfig.attributes = this.buildAttributesClause(include.attributes);
      }

      // Add nested includes (recursive)
      if (include.include) {
        includeConfig.include = this.buildIncludeClause(include.include);
      }

      // Required join (INNER vs LEFT)
      if (include.required !== undefined) {
        includeConfig.required = include.required;
      }

      // Separate results
      if (include.separate !== undefined) {
        includeConfig.separate = include.separate;
      }

      return includeConfig;
    });
  }

  /**
   * Build dynamic filter from user input (safe)
   */
  buildDynamicFilter(field, operator, value) {
    const opKey = operator.replace(/^\$/, '');

    if (!this.operators[opKey]) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    // Validate field name (alphanumeric and underscore only)
    if (!/^[a-zA-Z0-9_$.]+$/.test(field)) {
      throw new Error(`Invalid field name: ${field}`);
    }

    return {
      [field]: {
        [this.operators[opKey]]: value
      }
    };
  }

  /**
   * Build date range filter
   */
  buildDateRangeFilter(field, startDate, endDate) {
    if (!startDate || !endDate) {
      throw new Error('Both startDate and endDate are required for date range filter');
    }

    return {
      [field]: {
        [Op.gte]: new Date(startDate),
        [Op.lte]: new Date(endDate)
      }
    };
  }

  /**
   * Build search filter (multiple fields with OR)
   */
  buildSearchFilter(searchTerm, fields) {
    if (!searchTerm || !fields || fields.length === 0) {
      return {};
    }

    return {
      [Op.or]: fields.map(field => ({
        [field]: {
          [Op.iLike]: `%${searchTerm}%`
        }
      }))
    };
  }

  /**
   * Build aggregation query
   */
  buildAggregationQuery(config) {
    const { groupBy, aggregations, filters, having } = config;

    const query = {
      attributes: [],
      group: this.buildGroupByClause(groupBy)
    };

    // Add grouping fields to attributes
    if (Array.isArray(groupBy)) {
      query.attributes.push(...groupBy);
    } else if (groupBy) {
      query.attributes.push(groupBy);
    }

    // Add aggregations
    if (aggregations && Array.isArray(aggregations)) {
      for (const agg of aggregations) {
        const aggFunc = this.aggregations[agg.function.toLowerCase()];
        if (aggFunc) {
          query.attributes.push([
            require('sequelize').fn(aggFunc, require('sequelize').col(agg.field)),
            agg.alias || `${agg.function}_${agg.field}`
          ]);
        }
      }
    }

    // Add filters
    if (filters) {
      query.where = this.buildWhereClause(filters);
    }

    // Add having clause
    if (having) {
      query.having = this.buildWhereClause(having);
    }

    return query;
  }

  /**
   * Build pivot/crosstab query configuration
   */
  buildPivotQuery(config) {
    const { rows, columns, values, aggregation = 'count', filters } = config;

    if (!rows || !columns || !values) {
      throw new Error('Pivot query requires rows, columns, and values');
    }

    // This is a complex query that typically requires raw SQL or post-processing
    // Return a configuration that can be used to build the query
    return {
      type: 'pivot',
      rows: Array.isArray(rows) ? rows : [rows],
      columns: Array.isArray(columns) ? columns : [columns],
      values: Array.isArray(values) ? values : [values],
      aggregation,
      filters: filters ? this.buildWhereClause(filters) : {},
      requiresPostProcessing: true
    };
  }

  /**
   * Validate query configuration
   */
  validateQuery(query) {
    const errors = [];

    // Validate operators
    if (query.where) {
      this.validateWhereClause(query.where, errors);
    }

    // Validate sorting
    if (query.order && Array.isArray(query.order)) {
      for (const sort of query.order) {
        if (Array.isArray(sort) && sort.length === 2) {
          const direction = sort[1].toUpperCase();
          if (!this.sortDirections.includes(direction)) {
            errors.push(`Invalid sort direction: ${direction}`);
          }
        }
      }
    }

    // Validate pagination
    if (query.limit !== undefined && (query.limit < 0 || query.limit > 10000)) {
      errors.push('Limit must be between 0 and 10000');
    }

    if (query.offset !== undefined && query.offset < 0) {
      errors.push('Offset must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate WHERE clause recursively
   */
  validateWhereClause(where, errors = []) {
    if (!where || typeof where !== 'object') {
      return errors;
    }

    for (const [key, value] of Object.entries(where)) {
      // Check for SQL injection patterns in field names
      if (typeof key === 'string' && !key.startsWith('$')) {
        if (!/^[a-zA-Z0-9_$.]+$/.test(key)) {
          errors.push(`Invalid field name: ${key}`);
        }
      }

      // Recursively validate nested conditions
      if (typeof value === 'object' && value !== null) {
        this.validateWhereClause(value, errors);
      }
    }

    return errors;
  }

  /**
   * Build query from simplified query language
   * Example: "status = 'active' AND createdAt > '2024-01-01' ORDER BY name"
   */
  parseQueryString(queryString) {
    // This is a simplified parser - in production, use a proper parser
    const query = {};

    // Extract ORDER BY
    const orderMatch = queryString.match(/ORDER\s+BY\s+(.+?)(?:\s+|$)/i);
    if (orderMatch) {
      const orderParts = orderMatch[1].split(',').map(part => {
        const [field, direction] = part.trim().split(/\s+/);
        return [field, (direction || 'ASC').toUpperCase()];
      });
      query.order = orderParts;
      queryString = queryString.replace(orderMatch[0], '');
    }

    // Extract LIMIT
    const limitMatch = queryString.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      query.limit = parseInt(limitMatch[1], 10);
      queryString = queryString.replace(limitMatch[0], '');
    }

    // Extract OFFSET
    const offsetMatch = queryString.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) {
      query.offset = parseInt(offsetMatch[1], 10);
      queryString = queryString.replace(offsetMatch[0], '');
    }

    // Parse WHERE conditions (simplified)
    const where = {};
    const conditions = queryString.split(/\s+AND\s+/i);

    for (const condition of conditions) {
      const match = condition.match(/(\w+)\s*(=|>|<|>=|<=|!=|LIKE)\s*'?([^']+)'?/i);
      if (match) {
        const [, field, operator, value] = match;
        const opMap = {
          '=': 'eq',
          '>': 'gt',
          '<': 'lt',
          '>=': 'gte',
          '<=': 'lte',
          '!=': 'ne',
          'LIKE': 'like'
        };

        const opKey = opMap[operator.toUpperCase()];
        if (opKey) {
          where[field] = { [opKey]: value.trim() };
        }
      }
    }

    if (Object.keys(where).length > 0) {
      query.where = this.buildWhereClause(where);
    }

    return query;
  }

  /**
   * Convert query to human-readable description
   */
  describeQuery(query) {
    const parts = [];

    if (query.where && Object.keys(query.where).length > 0) {
      parts.push(`Filtered by: ${this.describeWhereClause(query.where)}`);
    }

    if (query.order && query.order.length > 0) {
      const orderDesc = query.order.map(([field, dir]) => `${field} ${dir}`).join(', ');
      parts.push(`Sorted by: ${orderDesc}`);
    }

    if (query.group && query.group.length > 0) {
      parts.push(`Grouped by: ${query.group.join(', ')}`);
    }

    if (query.limit !== undefined) {
      parts.push(`Limited to: ${query.limit} records`);
    }

    if (query.offset !== undefined) {
      parts.push(`Starting at: ${query.offset}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'All records';
  }

  /**
   * Describe WHERE clause in human-readable format
   */
  describeWhereClause(where, level = 0) {
    const parts = [];

    for (const [key, value] of Object.entries(where)) {
      if (key === Symbol.for('or')) {
        parts.push(`(${value.map(v => this.describeWhereClause(v, level + 1)).join(' OR ')})`);
      } else if (key === Symbol.for('and')) {
        parts.push(`(${value.map(v => this.describeWhereClause(v, level + 1)).join(' AND ')})`);
      } else if (typeof value === 'object' && value !== null) {
        for (const [op, val] of Object.entries(value)) {
          const opDesc = this.describeOperator(op);
          parts.push(`${key} ${opDesc} ${JSON.stringify(val)}`);
        }
      } else {
        parts.push(`${key} = ${JSON.stringify(value)}`);
      }
    }

    return parts.join(' AND ');
  }

  /**
   * Get human-readable operator description
   */
  describeOperator(op) {
    const opDescriptions = {
      [Op.eq]: '=',
      [Op.ne]: '!=',
      [Op.gt]: '>',
      [Op.gte]: '>=',
      [Op.lt]: '<',
      [Op.lte]: '<=',
      [Op.between]: 'BETWEEN',
      [Op.in]: 'IN',
      [Op.notIn]: 'NOT IN',
      [Op.like]: 'LIKE',
      [Op.iLike]: 'ILIKE'
    };

    return opDescriptions[op] || op.toString();
  }
}

module.exports = new ReportQueryBuilder();
