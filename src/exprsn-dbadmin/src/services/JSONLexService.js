const jsonata = require('jsonata');
const Joi = require('joi');
const { logger } = require('@exprsn/shared');
const connectionPoolManager = require('./ConnectionPoolManager');

/**
 * JSONLex service for PostgreSQL JSON/JSONB column editing and querying
 * Enables advanced JSON manipulation in database columns
 */
class JSONLexService {
  constructor() {
    this.enabled = process.env.JSONLEX_ENABLED !== 'false';
  }

  /**
   * Query JSON column using JSONata expression
   * @param {Object} connectionConfig - Database connection
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {string} jsonColumn - JSON column name
   * @param {string} jsonataExpression - JSONata query expression
   * @param {Object} options - Query options (where, limit, offset)
   */
  async queryJSONColumn(connectionConfig, schema, table, jsonColumn, jsonataExpression, options = {}) {
    const { where = null, limit = 100, offset = 0 } = options;

    try {
      // Fetch rows with JSON data
      let sql = `SELECT *, ${jsonColumn} as _json_data FROM "${schema}"."${table}"`;

      if (where) {
        sql += ` WHERE ${where}`;
      }

      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const result = await connectionPoolManager.executeQuery(connectionConfig, sql);

      // Apply JSONata transformation to each row's JSON column
      const compiled = jsonata(jsonataExpression);
      const transformedRows = [];

      for (const row of result.rows) {
        try {
          const jsonData = row._json_data;
          const transformed = await compiled.evaluate(jsonData);

          transformedRows.push({
            ...row,
            _jsonata_result: transformed
          });
        } catch (error) {
          logger.warn('JSONata evaluation failed for row', {
            error: error.message,
            rowId: row.id
          });

          transformedRows.push({
            ...row,
            _jsonata_error: error.message
          });
        }
      }

      return {
        success: true,
        rows: transformedRows,
        total: transformedRows.length
      };

    } catch (error) {
      logger.error('JSON column query failed', {
        error: error.message,
        schema,
        table,
        column: jsonColumn
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update JSON column using JSONata transformation
   * @param {Object} connectionConfig - Database connection
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {string} jsonColumn - JSON column name
   * @param {string} jsonataTransform - JSONata transformation expression
   * @param {string} whereClause - SQL WHERE clause
   */
  async updateJSONColumn(connectionConfig, schema, table, jsonColumn, jsonataTransform, whereClause) {
    try {
      // Fetch rows to update
      const selectSql = `SELECT id, ${jsonColumn} FROM "${schema}"."${table}" WHERE ${whereClause}`;
      const selectResult = await connectionPoolManager.executeQuery(connectionConfig, selectSql);

      if (selectResult.rows.length === 0) {
        return {
          success: true,
          updated: 0,
          message: 'No rows matched the criteria'
        };
      }

      const compiled = jsonata(jsonataTransform);
      let updated = 0;

      // Update each row
      for (const row of selectResult.rows) {
        try {
          const currentData = row[jsonColumn];
          const transformedData = await compiled.evaluate(currentData);

          const updateSql = `
            UPDATE "${schema}"."${table}"
            SET ${jsonColumn} = $1
            WHERE id = $2
          `;

          await connectionPoolManager.executeQuery(
            connectionConfig,
            updateSql,
            [JSON.stringify(transformedData), row.id]
          );

          updated++;
        } catch (error) {
          logger.warn('Failed to update row', {
            error: error.message,
            rowId: row.id
          });
        }
      }

      return {
        success: true,
        updated,
        total: selectResult.rows.length
      };

    } catch (error) {
      logger.error('JSON column update failed', {
        error: error.message,
        schema,
        table,
        column: jsonColumn
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate JSON data against a schema
   * @param {Object} data - JSON data to validate
   * @param {Object} schema - JSONLex/JSON Schema
   */
  async validate(data, schema) {
    if (!this.enabled) {
      return { valid: true, data };
    }

    try {
      const joiSchema = this.convertToJoiSchema(schema);
      const { error, value } = joiSchema.validate(data, {
        abortEarly: false,
        allowUnknown: true
      });

      if (error) {
        return {
          valid: false,
          errors: error.details.map(detail => ({
            path: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          }))
        };
      }

      return {
        valid: true,
        data: value
      };
    } catch (error) {
      logger.error('JSONLex validation error', { error: error.message });
      return {
        valid: false,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Convert JSONLex schema to Joi schema
   */
  convertToJoiSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return Joi.any();
    }

    const type = schema.type || 'object';

    switch (type) {
      case 'object':
        return this.buildObjectSchema(schema);
      case 'array':
        return this.buildArraySchema(schema);
      case 'string':
        return this.buildStringSchema(schema);
      case 'number':
      case 'integer':
        return this.buildNumberSchema(schema);
      case 'boolean':
        return Joi.boolean();
      default:
        return Joi.any();
    }
  }

  buildObjectSchema(schema) {
    let joiSchema = Joi.object();

    if (schema.properties) {
      const schemaMap = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        schemaMap[key] = this.convertToJoiSchema(propSchema);
      }
      joiSchema = joiSchema.keys(schemaMap);
    }

    if (schema.required && Array.isArray(schema.required)) {
      const requiredKeys = {};
      for (const key of schema.required) {
        requiredKeys[key] = Joi.any().required();
      }
      joiSchema = joiSchema.keys(requiredKeys);
    }

    return joiSchema;
  }

  buildArraySchema(schema) {
    let joiSchema = Joi.array();

    if (schema.items) {
      joiSchema = joiSchema.items(this.convertToJoiSchema(schema.items));
    }

    if (schema.minItems !== undefined) {
      joiSchema = joiSchema.min(schema.minItems);
    }

    if (schema.maxItems !== undefined) {
      joiSchema = joiSchema.max(schema.maxItems);
    }

    return joiSchema;
  }

  buildStringSchema(schema) {
    let joiSchema = Joi.string();

    if (schema.minLength !== undefined) {
      joiSchema = joiSchema.min(schema.minLength);
    }

    if (schema.maxLength !== undefined) {
      joiSchema = joiSchema.max(schema.maxLength);
    }

    if (schema.pattern) {
      joiSchema = joiSchema.pattern(new RegExp(schema.pattern));
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      joiSchema = joiSchema.valid(...schema.enum);
    }

    return joiSchema;
  }

  buildNumberSchema(schema) {
    let joiSchema = schema.type === 'integer' ? Joi.number().integer() : Joi.number();

    if (schema.minimum !== undefined) {
      joiSchema = joiSchema.min(schema.minimum);
    }

    if (schema.maximum !== undefined) {
      joiSchema = joiSchema.max(schema.maximum);
    }

    return joiSchema;
  }

  /**
   * Execute PostgreSQL JSON operators
   * @param {Object} connectionConfig - Database connection
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {string} jsonColumn - JSON column name
   * @param {string} operator - JSON operator (->>, ->, #>, etc.)
   * @param {string} path - JSON path
   * @param {Object} options - Query options
   */
  async executeJSONOperator(connectionConfig, schema, table, jsonColumn, operator, path, options = {}) {
    const { where = null, limit = 100, offset = 0 } = options;

    try {
      const sql = `
        SELECT *, ${jsonColumn}${operator}'${path}' as extracted_value
        FROM "${schema}"."${table}"
        ${where ? `WHERE ${where}` : ''}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const result = await connectionPoolManager.executeQuery(connectionConfig, sql);

      return {
        success: true,
        rows: result.rows
      };

    } catch (error) {
      logger.error('JSON operator execution failed', {
        error: error.message,
        operator,
        path
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Infer schema from sample JSON data
   */
  inferSchema(data) {
    if (data === null || data === undefined) {
      return { type: 'any' };
    }

    const type = Array.isArray(data) ? 'array' : typeof data;

    switch (type) {
      case 'object':
        const properties = {};
        for (const [key, value] of Object.entries(data)) {
          properties[key] = this.inferSchema(value);
        }
        return { type: 'object', properties };

      case 'array':
        if (data.length > 0) {
          return { type: 'array', items: this.inferSchema(data[0]) };
        }
        return { type: 'array' };

      case 'string':
        return { type: 'string' };

      case 'number':
        return { type: Number.isInteger(data) ? 'integer' : 'number' };

      case 'boolean':
        return { type: 'boolean' };

      default:
        return { type: 'any' };
    }
  }

  /**
   * Get JSON column statistics
   */
  async getJSONColumnStats(connectionConfig, schema, table, jsonColumn) {
    try {
      const sql = `
        SELECT
          COUNT(*) as total_rows,
          COUNT(${jsonColumn}) as non_null_rows,
          pg_column_size(${jsonColumn}) as avg_size_bytes
        FROM "${schema}"."${table}"
      `;

      const result = await connectionPoolManager.executeQuery(connectionConfig, sql);

      return {
        success: true,
        stats: result.rows[0]
      };

    } catch (error) {
      logger.error('Failed to get JSON column stats', {
        error: error.message,
        schema,
        table,
        column: jsonColumn
      });

      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new JSONLexService();
