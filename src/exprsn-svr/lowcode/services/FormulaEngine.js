/**
 * Formula Execution Engine
 *
 * Parses and executes formulas using the function library.
 * Supports Excel-like, Power Query, and R-style functions.
 */

const db = require('../models');

class FormulaEngine {
  constructor() {
    this.functions = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the engine by loading all functions from database
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const functions = await db.sequelize.query(`
        SELECT id, name, implementation, parameters, return_type
        FROM function_library
        WHERE is_enabled = true
      `, { type: db.sequelize.QueryTypes.SELECT });

      // Register each function
      functions.forEach(func => {
        try {
          // Safely evaluate the implementation
          const fn = this.createFunction(func.implementation, func.parameters);
          this.functions.set(func.name, {
            fn,
            parameters: func.parameters,
            returnType: func.return_type
          });
        } catch (error) {
          console.error(`Failed to register function ${func.name}:`, error);
        }
      });

      this.initialized = true;
      console.log(`Formula engine initialized with ${this.functions.size} functions`);
    } catch (error) {
      console.error('Failed to initialize formula engine:', error);
      throw error;
    }
  }

  /**
   * Create a function from implementation string
   */
  createFunction(implementation, parameters) {
    // If implementation is already a function string like "value => String(value).toUpperCase()"
    if (implementation.includes('=>')) {
      return eval(`(${implementation})`);
    }

    // Otherwise create function from parameters
    const paramNames = parameters.map(p => p.name).join(', ');
    return new Function(paramNames, `return ${implementation}`);
  }

  /**
   * Execute a formula with given context
   */
  async execute(formula, context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Parse and execute the formula
      const result = this.parseAndExecute(formula, context);
      return {
        success: true,
        result,
        formula,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        formula,
        timestamp: new Date()
      };
    }
  }

  /**
   * Parse and execute a formula string
   */
  parseAndExecute(formula, context) {
    // Remove comments
    formula = formula.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    formula = formula.trim();

    if (!formula) {
      throw new Error('Empty formula');
    }

    // Simple execution - evaluate the formula with available functions
    const scope = this.createExecutionScope(context);

    try {
      // Use Function constructor for safer evaluation than eval
      const fn = new Function(...Object.keys(scope), `return ${formula}`);
      const result = fn(...Object.values(scope));
      return result;
    } catch (error) {
      throw new Error(`Execution error: ${error.message}`);
    }
  }

  /**
   * Create execution scope with all available functions and context
   */
  createExecutionScope(context = {}) {
    const scope = { ...context };

    // Add all registered functions to scope
    this.functions.forEach((funcData, name) => {
      scope[name] = funcData.fn;
    });

    // Add built-in JavaScript functions that are safe
    scope.Math = Math;
    scope.String = String;
    scope.Number = Number;
    scope.Boolean = Boolean;
    scope.Array = Array;
    scope.Object = Object;
    scope.Date = Date;
    scope.JSON = JSON;

    return scope;
  }

  /**
   * Get all available functions
   */
  getAvailableFunctions() {
    return Array.from(this.functions.keys());
  }

  /**
   * Get function details
   */
  getFunctionDetails(name) {
    return this.functions.get(name);
  }

  /**
   * Validate formula syntax without executing
   */
  validate(formula) {
    try {
      // Basic syntax validation
      formula = formula.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

      if (!formula) {
        return { valid: false, error: 'Empty formula' };
      }

      // Try to parse (but not execute)
      const scope = this.createExecutionScope({});
      new Function(...Object.keys(scope), `return ${formula}`);

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get function suggestions for autocomplete
   */
  getSuggestions(prefix = '') {
    const suggestions = [];

    this.functions.forEach((funcData, name) => {
      if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
        suggestions.push({
          name,
          parameters: funcData.parameters,
          returnType: funcData.returnType
        });
      }
    });

    return suggestions;
  }
}

// Export singleton instance
module.exports = new FormulaEngine();
