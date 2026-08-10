/**
 * Join and Cross-Tab Builder Service
 * Handles table joins with type matching and cross-tabulation / pivot tables
 */

const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../../../config/database');
const logger = require('../../../utils/logger');

class JoinAndCrossTabBuilder {
  constructor() {
    // Join types
    this.joinTypes = {
      INNER: 'INNER',
      LEFT: 'LEFT',
      RIGHT: 'RIGHT',
      FULL: 'FULL OUTER',
      CROSS: 'CROSS'
    };

    // Data type categories for matching
    this.dataTypeCategories = {
      numeric: ['INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'FLOAT'],
      string: ['VARCHAR', 'CHAR', 'TEXT', 'CHARACTER VARYING'],
      date: ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITHOUT TIME ZONE'],
      boolean: ['BOOLEAN', 'BOOL'],
      json: ['JSON', 'JSONB'],
      uuid: ['UUID']
    };

    // Type compatibility matrix
    this.typeCompatibility = {
      numeric: ['numeric'],
      string: ['string', 'uuid'], // strings can match UUIDs
      date: ['date'],
      boolean: ['boolean'],
      json: ['json'],
      uuid: ['uuid', 'string'] // UUIDs can match strings
    };
  }

  /**
   * Analyze table schema
   */
  async analyzeTableSchema(tableName, schema = 'public') {
    try {
      const query = `
        SELECT
          column_name,
          data_type,
          udt_name,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = :schema
          AND table_name = :tableName
        ORDER BY ordinal_position
      `;

      const [results] = await sequelize.query(query, {
        replacements: { schema, tableName },
        type: Sequelize.QueryTypes.SELECT
      });

      return results.map(col => ({
        name: col.column_name,
        dataType: col.data_type.toUpperCase(),
        udtName: col.udt_name,
        maxLength: col.character_maximum_length,
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        category: this.categorizeDataType(col.data_type)
      }));
    } catch (err) {
      logger.error('Failed to analyze table schema', {
        tableName,
        schema,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Find joinable columns between two tables
   */
  async findJoinableColumns(leftTable, rightTable, options = {}) {
    const {
      leftSchema = 'public',
      rightSchema = 'public',
      strictTypeMatch = false,
      includeIncompatible = false
    } = options;

    // Analyze both tables
    const leftColumns = await this.analyzeTableSchema(leftTable, leftSchema);
    const rightColumns = await this.analyzeTableSchema(rightTable, rightSchema);

    const joinableColumns = [];

    for (const leftCol of leftColumns) {
      for (const rightCol of rightColumns) {
        // Check if types are compatible
        const compatible = this.areTypesCompatible(
          leftCol.category,
          rightCol.category,
          strictTypeMatch
        );

        if (compatible || includeIncompatible) {
          joinableColumns.push({
            leftColumn: leftCol.name,
            rightColumn: rightCol.name,
            leftType: leftCol.dataType,
            rightType: rightCol.dataType,
            leftCategory: leftCol.category,
            rightCategory: rightCol.category,
            compatible,
            confidence: this.calculateJoinConfidence(leftCol, rightCol)
          });
        }
      }
    }

    // Sort by confidence (highest first)
    joinableColumns.sort((a, b) => b.confidence - a.confidence);

    logger.info('Found joinable columns', {
      leftTable,
      rightTable,
      joinableCount: joinableColumns.filter(j => j.compatible).length,
      totalPairs: joinableColumns.length
    });

    return joinableColumns;
  }

  /**
   * Calculate join confidence score (0-100)
   */
  calculateJoinConfidence(leftCol, rightCol) {
    let confidence = 0;

    // Exact name match
    if (leftCol.name === rightCol.name) {
      confidence += 50;
    }

    // Partial name match (e.g., "user_id" and "id")
    if (leftCol.name.includes(rightCol.name) || rightCol.name.includes(leftCol.name)) {
      confidence += 30;
    }

    // Common naming patterns (id, _id, Id, ID)
    if ((leftCol.name.match(/id$/i) || leftCol.name.match(/_id$/i)) &&
        (rightCol.name.match(/id$/i) || rightCol.name.match(/_id$/i))) {
      confidence += 20;
    }

    // Type match
    if (leftCol.dataType === rightCol.dataType) {
      confidence += 20;
    } else if (leftCol.category === rightCol.category) {
      confidence += 10;
    }

    // UUID/ID pattern
    if (leftCol.category === 'uuid' && rightCol.category === 'uuid') {
      confidence += 15;
    }

    return Math.min(100, confidence);
  }

  /**
   * Categorize data type
   */
  categorizeDataType(dataType) {
    const upperType = dataType.toUpperCase();

    for (const [category, types] of Object.entries(this.dataTypeCategories)) {
      if (types.some(type => upperType.includes(type))) {
        return category;
      }
    }

    return 'unknown';
  }

  /**
   * Check if two data type categories are compatible
   */
  areTypesCompatible(category1, category2, strict = false) {
    if (category1 === category2) {
      return true;
    }

    if (strict) {
      return false;
    }

    // Check compatibility matrix
    const compatible1 = this.typeCompatibility[category1] || [];
    return compatible1.includes(category2);
  }

  /**
   * Build join query
   */
  async buildJoinQuery(joinConfig) {
    const {
      leftTable,
      rightTable,
      joinType = this.joinTypes.INNER,
      conditions, // Array of { leftColumn, rightColumn, operator }
      leftSchema = 'public',
      rightSchema = 'public',
      selectColumns = null, // Array of columns to select
      whereClause = null,
      orderBy = null,
      limit = null
    } = joinConfig;

    // Validate join type
    if (!Object.values(this.joinTypes).includes(joinType)) {
      throw new Error(`Invalid join type: ${joinType}`);
    }

    // Validate conditions
    if (!conditions || conditions.length === 0) {
      throw new Error('At least one join condition is required');
    }

    // Verify type compatibility for join conditions
    const leftColumns = await this.analyzeTableSchema(leftTable, leftSchema);
    const rightColumns = await this.analyzeTableSchema(rightTable, rightSchema);

    for (const condition of conditions) {
      const leftCol = leftColumns.find(c => c.name === condition.leftColumn);
      const rightCol = rightColumns.find(c => c.name === condition.rightColumn);

      if (!leftCol) {
        throw new Error(`Left column not found: ${condition.leftColumn}`);
      }

      if (!rightCol) {
        throw new Error(`Right column not found: ${condition.rightColumn}`);
      }

      if (!this.areTypesCompatible(leftCol.category, rightCol.category)) {
        logger.warn('Incompatible types in join condition', {
          leftColumn: condition.leftColumn,
          leftType: leftCol.dataType,
          rightColumn: condition.rightColumn,
          rightType: rightCol.dataType
        });
      }
    }

    // Build SELECT clause
    const selectClause = selectColumns && selectColumns.length > 0
      ? selectColumns.map(col => {
          if (col.includes('.')) {
            return col; // Already qualified
          }
          return `l.${col}`;
        }).join(', ')
      : 'l.*, r.*';

    // Build JOIN conditions
    const joinConditions = conditions.map((cond, index) => {
      const operator = cond.operator || '=';
      return `l.${cond.leftColumn} ${operator} r.${cond.rightColumn}`;
    }).join(' AND ');

    // Build query
    let query = `
      SELECT ${selectClause}
      FROM ${leftSchema}.${leftTable} l
      ${joinType} JOIN ${rightSchema}.${rightTable} r
        ON ${joinConditions}
    `;

    // Add WHERE clause
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    // Add ORDER BY
    if (orderBy) {
      const orderClauses = Array.isArray(orderBy)
        ? orderBy.map(o => `${o.column} ${o.direction || 'ASC'}`).join(', ')
        : orderBy;
      query += ` ORDER BY ${orderClauses}`;
    }

    // Add LIMIT
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    return query;
  }

  /**
   * Execute join
   */
  async executeJoin(joinConfig) {
    try {
      const query = await this.buildJoinQuery(joinConfig);

      logger.info('Executing join query', {
        leftTable: joinConfig.leftTable,
        rightTable: joinConfig.rightTable,
        joinType: joinConfig.joinType
      });

      const startTime = Date.now();
      const [results] = await sequelize.query(query, {
        type: Sequelize.QueryTypes.SELECT
      });
      const executionTime = Date.now() - startTime;

      logger.info('Join query executed', {
        resultCount: results.length,
        executionTime: `${executionTime}ms`
      });

      return {
        data: results,
        rowCount: results.length,
        executionTime,
        query
      };
    } catch (err) {
      logger.error('Join execution failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Build cross-tab / pivot table
   */
  async buildCrossTab(crossTabConfig) {
    const {
      tableName,
      schema = 'public',
      rows,           // Array of row fields
      columns,        // Array of column fields
      values,         // Array of value fields to aggregate
      aggregations,   // Object mapping value fields to aggregation functions
      filters = null,
      showTotals = true,
      showGrandTotals = true
    } = crossTabConfig;

    if (!rows || rows.length === 0) {
      throw new Error('At least one row field is required');
    }

    if (!columns || columns.length === 0) {
      throw new Error('At least one column field is required');
    }

    if (!values || values.length === 0) {
      throw new Error('At least one value field is required');
    }

    // Build aggregation expressions
    const aggExpressions = values.map(valueField => {
      const aggFunc = (aggregations && aggregations[valueField]) || 'COUNT';
      return `${aggFunc}(${valueField}) AS ${valueField}_${aggFunc.toLowerCase()}`;
    }).join(', ');

    // Build GROUP BY clause
    const groupByFields = [...rows, ...columns].join(', ');

    // Build WHERE clause
    const whereClause = filters ? ` WHERE ${filters}` : '';

    // Main query
    const query = `
      SELECT
        ${rows.join(', ')},
        ${columns.join(', ')},
        ${aggExpressions}
      FROM ${schema}.${tableName}
      ${whereClause}
      GROUP BY ${groupByFields}
      ORDER BY ${rows.join(', ')}, ${columns.join(', ')}
    `;

    logger.info('Executing cross-tab query', {
      tableName,
      rows,
      columns,
      values
    });

    const startTime = Date.now();
    const [results] = await sequelize.query(query, {
      type: Sequelize.QueryTypes.SELECT
    });
    const executionTime = Date.now() - startTime;

    // Pivot the results
    const pivoted = this.pivotData(results, rows, columns, values, aggregations);

    // Calculate totals
    if (showTotals || showGrandTotals) {
      this.calculateCrossTabTotals(pivoted, {
        rows,
        columns,
        values,
        showTotals,
        showGrandTotals
      });
    }

    logger.info('Cross-tab built', {
      resultCount: results.length,
      pivotedRows: Object.keys(pivoted.data).length,
      executionTime: `${executionTime}ms`
    });

    return {
      ...pivoted,
      executionTime,
      query
    };
  }

  /**
   * Pivot data into cross-tab format
   */
  pivotData(results, rows, columns, values, aggregations) {
    const pivotedData = {};
    const columnValues = new Set();
    const rowValues = new Set();

    // Extract unique column and row values
    for (const result of results) {
      const rowKey = rows.map(r => result[r]).join('|');
      const colKey = columns.map(c => result[c]).join('|');

      rowValues.add(rowKey);
      columnValues.add(colKey);

      if (!pivotedData[rowKey]) {
        pivotedData[rowKey] = {
          rowData: rows.reduce((acc, r) => {
            acc[r] = result[r];
            return acc;
          }, {}),
          columns: {}
        };
      }

      pivotedData[rowKey].columns[colKey] = values.reduce((acc, v) => {
        const aggFunc = (aggregations && aggregations[v]) || 'COUNT';
        const fieldName = `${v}_${aggFunc.toLowerCase()}`;
        acc[v] = result[fieldName];
        return acc;
      }, {});
    }

    return {
      data: pivotedData,
      rowKeys: Array.from(rowValues),
      columnKeys: Array.from(columnValues),
      metadata: {
        rows,
        columns,
        values,
        aggregations
      }
    };
  }

  /**
   * Calculate cross-tab totals
   */
  calculateCrossTabTotals(pivoted, options) {
    const { rows, columns, values, showTotals, showGrandTotals } = options;

    // Row totals
    if (showTotals) {
      for (const [rowKey, rowData] of Object.entries(pivoted.data)) {
        const totals = {};

        for (const value of values) {
          let total = 0;
          for (const colKey of pivoted.columnKeys) {
            total += rowData.columns[colKey]?.[value] || 0;
          }
          totals[value] = total;
        }

        rowData.columns['__TOTAL__'] = totals;
      }

      // Add __TOTAL__ to column keys
      if (!pivoted.columnKeys.includes('__TOTAL__')) {
        pivoted.columnKeys.push('__TOTAL__');
      }
    }

    // Grand totals
    if (showGrandTotals) {
      const grandTotals = {
        rowData: { __label__: 'Grand Total' },
        columns: {}
      };

      for (const colKey of pivoted.columnKeys) {
        const totals = {};

        for (const value of values) {
          let total = 0;
          for (const rowKey of pivoted.rowKeys) {
            total += pivoted.data[rowKey].columns[colKey]?.[value] || 0;
          }
          totals[value] = total;
        }

        grandTotals.columns[colKey] = totals;
      }

      pivoted.data['__GRAND_TOTAL__'] = grandTotals;
      pivoted.rowKeys.push('__GRAND_TOTAL__');
    }

    return pivoted;
  }

  /**
   * Suggest join strategy
   */
  async suggestJoinStrategy(leftTable, rightTable, options = {}) {
    const {
      leftSchema = 'public',
      rightSchema = 'public'
    } = options;

    // Find joinable columns
    const joinableColumns = await this.findJoinableColumns(
      leftTable,
      rightTable,
      { leftSchema, rightSchema }
    );

    if (joinableColumns.length === 0) {
      return {
        suggested: false,
        reason: 'No compatible columns found for joining'
      };
    }

    // Get best join candidate
    const bestJoin = joinableColumns[0];

    if (bestJoin.confidence < 30) {
      return {
        suggested: false,
        reason: 'Low confidence in join candidates',
        candidates: joinableColumns.slice(0, 5)
      };
    }

    // Suggest join type based on column names and types
    let suggestedJoinType = this.joinTypes.INNER;

    if (bestJoin.leftColumn.includes('optional') || bestJoin.rightColumn.includes('optional')) {
      suggestedJoinType = this.joinTypes.LEFT;
    }

    return {
      suggested: true,
      joinType: suggestedJoinType,
      condition: {
        leftColumn: bestJoin.leftColumn,
        rightColumn: bestJoin.rightColumn,
        operator: '='
      },
      confidence: bestJoin.confidence,
      alternatives: joinableColumns.slice(1, 5)
    };
  }

  /**
   * Validate join configuration
   */
  async validateJoinConfig(joinConfig) {
    const errors = [];

    // Check tables exist
    // (In production, query information_schema to verify)

    // Check join type
    if (!Object.values(this.joinTypes).includes(joinConfig.joinType)) {
      errors.push(`Invalid join type: ${joinConfig.joinType}`);
    }

    // Check conditions
    if (!joinConfig.conditions || joinConfig.conditions.length === 0) {
      errors.push('At least one join condition is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new JoinAndCrossTabBuilder();
