/**
 * JSONLex Service - Wrapper for Unified Expression Engine
 *
 * This service now uses the shared ExpressionEngine from @exprsn/shared
 * for consistency across all Exprsn services.
 *
 * @deprecated Use expressionEngine from @exprsn/shared directly
 */

const { expressionEngine } = require('@exprsn/shared');
const logger = require('../utils/logger');

class JSONLexService {
  constructor() {
    // Delegate to shared expression engine
    this.engine = expressionEngine;
    this.enabled = process.env.JSONLEX_ENABLED !== 'false';
    this.strictValidation = process.env.JSONLEX_VALIDATION_STRICT === 'true';
  }

  /**
   * Validate data against JSONLex schema
   * Delegates to shared expression engine
   */
  async validate(data, schema) {
    return await this.engine.validate(data, schema);
  }

  /**
   * Convert JSONLex schema to Joi schema
   * Delegates to shared expression engine
   */
  convertToJoiSchema(schema) {
    return this.engine.convertToJoiSchema(schema);
  }

  /**
   * Transform data using JSONata expression
   * Delegates to shared expression engine
   */
  async transform(data, expression) {
    return await this.engine.transform(data, expression);
  }

  /**
   * Query data using JSONata
   * Delegates to shared expression engine
   */
  async query(data, query) {
    return await this.engine.query(data, query);
  }

  /**
   * Filter array data using JSONata predicate
   * Delegates to shared expression engine
   */
  async filter(data, predicate) {
    return await this.engine.filter(data, predicate);
  }

  /**
   * Map array data using JSONata expression
   * Delegates to shared expression engine
   */
  async map(data, mapping) {
    return await this.engine.map(data, mapping);
  }

  /**
   * Reduce array data using JSONata expression
   * Delegates to shared expression engine
   */
  async reduce(data, expression, initialValue) {
    return await this.engine.reduce(data, expression, initialValue);
  }

  /**
   * Validate and transform in one operation
   * Delegates to shared expression engine
   */
  async validateAndTransform(data, schema, transformExpression) {
    return await this.engine.validateAndTransform(data, schema, transformExpression);
  }

  /**
   * Create schema from sample data
   * Delegates to shared expression engine
   */
  inferSchema(data) {
    return this.engine.inferSchema(data);
  }

  /**
   * Merge multiple schemas
   * Delegates to shared expression engine
   */
  mergeSchemas(...schemas) {
    return this.engine.mergeSchemas(...schemas);
  }

  /**
   * Evaluate expression (auto-detects engine type)
   * New unified method that supports both JSONata and Formula syntax
   */
  async evaluate(expression, data, options) {
    return await this.engine.evaluate(expression, data, options);
  }
}

// Re-export shared expression engine for direct access
module.exports.expressionEngine = expressionEngine;

module.exports = new JSONLexService();
