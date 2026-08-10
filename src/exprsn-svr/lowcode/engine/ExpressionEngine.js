/**
 * Low-Code Expression Engine - Wrapper for Unified Expression Engine
 *
 * This replaces the previous FormulaEngine and provides access to both:
 * - JSONata expressions (JSONLex)
 * - Power Apps-style formulas (expr-eval)
 *
 * Uses the shared ExpressionEngine from @exprsn/shared for consistency.
 *
 * @deprecated FormulaEngine - Use this ExpressionEngine instead
 */

const { expressionEngine } = require('@exprsn/shared');

class LowCodeExpressionEngine {
  constructor() {
    this.engine = expressionEngine;
    this.context = {};
    this.collections = new Map();
    this.variables = new Map();
  }

  /**
   * Set context for expression evaluation
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Set collections (in-memory tables)
   */
  setCollections(collections) {
    if (Array.isArray(collections)) {
      collections.forEach(col => {
        this.collections.set(col.name, col.data || []);
      });
    } else {
      Object.keys(collections).forEach(name => {
        this.collections.set(name, collections[name]);
      });
    }
  }

  /**
   * Evaluate expression - Auto-detects JSONata vs Formula syntax
   * @param {string} expression - Expression to evaluate
   * @param {object} localContext - Local context (merged with global context)
   * @param {object} options - Evaluation options (engine: 'jsonata'|'formula', timeout, etc.)
   */
  async evaluate(expression, localContext = {}, options = {}) {
    const fullContext = {
      ...this.context,
      ...localContext
    };

    return await this.engine.evaluate(expression, fullContext, options);
  }

  /**
   * Evaluate Power Apps-style formula
   */
  evaluateFormula(formula, context = {}) {
    const fullContext = { ...this.context, ...context };
    return this.engine.evaluateFormula(formula, fullContext);
  }

  /**
   * Evaluate JSONata expression
   */
  async evaluateJSONata(expression, data = {}, options = {}) {
    return await this.engine.transform(data, expression, options);
  }

  /**
   * Transform data using JSONata
   */
  async transform(data, expression, options = {}) {
    return await this.engine.transform(data, expression, options);
  }

  /**
   * Query data using JSONata
   */
  async query(data, queryExpression) {
    return await this.engine.query(data, queryExpression);
  }

  /**
   * Filter array data
   */
  async filter(data, predicate, options = {}) {
    const engine = options.engine || 'jsonata';

    if (engine === 'jsonata') {
      return await this.engine.filter(data, predicate);
    } else {
      // Formula-style filter (uses evaluateFormula)
      if (!Array.isArray(data)) {
        return { success: false, error: 'Data must be an array' };
      }

      try {
        const filtered = data.filter(item => {
          return this.evaluateFormula(predicate, item);
        });

        return { success: true, data: filtered };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }

  /**
   * Map array data
   */
  async map(data, mapping, options = {}) {
    const engine = options.engine || 'jsonata';

    if (engine === 'jsonata') {
      return await this.engine.map(data, mapping);
    } else {
      // Formula-style map
      if (!Array.isArray(data)) {
        return { success: false, error: 'Data must be an array' };
      }

      try {
        const mapped = data.map(item => {
          return this.evaluateFormula(mapping, item);
        });

        return { success: true, data: mapped };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  }

  /**
   * Validate data against schema
   */
  async validate(data, schema) {
    return await this.engine.validate(data, schema);
  }

  /**
   * Validate and transform
   */
  async validateAndTransform(data, schema, transformExpression, options = {}) {
    return await this.engine.validateAndTransform(data, schema, transformExpression, options);
  }

  /**
   * Infer schema from sample data
   */
  inferSchema(data) {
    return this.engine.inferSchema(data);
  }

  /**
   * Set a variable
   */
  setVariable(name, value) {
    this.variables.set(name, value);
    this.context[name] = value;
  }

  /**
   * Get a variable
   */
  getVariable(name) {
    return this.variables.get(name);
  }

  /**
   * Clear all variables
   */
  clearVariables() {
    this.variables.clear();
    // Preserve collections in context
    const collectionsObj = {};
    this.collections.forEach((value, key) => {
      collectionsObj[key] = value;
    });
    this.context = collectionsObj;
  }

  /**
   * Get current context
   */
  getContext() {
    return { ...this.context };
  }

  /**
   * Reset engine state
   */
  reset() {
    this.context = {};
    this.collections.clear();
    this.variables.clear();
  }
}

// Export singleton instance
module.exports = new LowCodeExpressionEngine();

// Also export class for testing
module.exports.LowCodeExpressionEngine = LowCodeExpressionEngine;

// Re-export shared expression engine for direct access
module.exports.expressionEngine = expressionEngine;
