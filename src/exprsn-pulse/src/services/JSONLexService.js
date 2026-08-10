/**
 * JSONLex Service
 * Evaluates JSONLex expressions for data transformation
 */

const logger = require('../utils/logger');

class JSONLexService {
  /**
   * Evaluate a JSONLex expression
   * @param {string} expression - JSONLex expression
   * @param {any} data - Input data
   * @param {object} context - Additional context variables
   * @returns {any} - Transformed data
   */
  static evaluate(expression, data, context = {}) {
    try {
      // JSONLex uses $ for data reference and @ for context
      // Example: "$.users[?(@.age > 25)].name"

      // For now, implement basic JSON path evaluation
      // In production, integrate with the JSONLex library from exprsn-workflow

      const result = this._evaluateExpression(expression, data, context);
      return result;
    } catch (error) {
      logger.error('JSONLex evaluation failed', {
        expression,
        error: error.message
      });
      throw new Error(`JSONLex evaluation failed: ${error.message}`);
    }
  }

  /**
   * Basic expression evaluator
   * This is a simplified version - full JSONLex support requires the complete library
   */
  static _evaluateExpression(expr, data, context) {
    // Simple property access: $.propertyName
    if (expr.startsWith('$.')) {
      const path = expr.substring(2).split('.');
      return this._getNestedValue(data, path);
    }

    // Array operations
    if (expr.includes('[*]')) {
      // Map over array
      const [arrayPath, ...rest] = expr.split('[*]');
      const array = this._evaluateExpression(arrayPath, data, context);

      if (!Array.isArray(array)) {
        throw new Error('Expected array for [*] operator');
      }

      if (rest.length === 0) {
        return array;
      }

      const itemExpr = rest.join('[*]');
      return array.map(item => this._evaluateExpression(itemExpr, item, context));
    }

    // Filter operations: $[?(@.property > value)]
    if (expr.includes('[?(')) {
      const matches = expr.match(/\$(\.\w+)*\[\?\((.*?)\)\](\.\w+)*/);
      if (matches) {
        const arrayPath = matches[1] || '';
        const filterExpr = matches[2];
        const resultPath = matches[3] || '';

        let array = data;
        if (arrayPath) {
          array = this._evaluateExpression('$' + arrayPath, data, context);
        }

        if (!Array.isArray(array)) {
          throw new Error('Expected array for filter operation');
        }

        const filtered = array.filter(item => {
          return this._evaluateFilter(filterExpr, item, context);
        });

        if (resultPath) {
          return filtered.map(item => this._getNestedValue(item, resultPath.substring(1).split('.')));
        }

        return filtered;
      }
    }

    // Arithmetic operations
    if (expr.includes('+') || expr.includes('-') || expr.includes('*') || expr.includes('/')) {
      return this._evaluateArithmetic(expr, data, context);
    }

    // Function calls
    if (expr.includes('(') && expr.includes(')')) {
      return this._evaluateFunction(expr, data, context);
    }

    // Literal values
    if (expr.startsWith('"') && expr.endsWith('"')) {
      return expr.slice(1, -1);
    }

    if (!isNaN(expr)) {
      return parseFloat(expr);
    }

    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;

    // Context variable: @variableName
    if (expr.startsWith('@.')) {
      const path = expr.substring(2).split('.');
      return this._getNestedValue(context, path);
    }

    return expr;
  }

  /**
   * Get nested value from object
   */
  static _getNestedValue(obj, path) {
    return path.reduce((current, key) => current?.[key], obj);
  }

  /**
   * Evaluate filter expression
   */
  static _evaluateFilter(expr, item, context) {
    // Simple comparison operators
    const operators = ['>=', '<=', '>', '<', '==', '!='];

    for (const op of operators) {
      if (expr.includes(op)) {
        const [left, right] = expr.split(op).map(s => s.trim());

        const leftValue = this._evaluateExpression(left.replace('@', '$'), item, context);
        const rightValue = this._evaluateExpression(right, item, context);

        switch (op) {
          case '>': return leftValue > rightValue;
          case '<': return leftValue < rightValue;
          case '>=': return leftValue >= rightValue;
          case '<=': return leftValue <= rightValue;
          case '==': return leftValue == rightValue;
          case '!=': return leftValue != rightValue;
        }
      }
    }

    return false;
  }

  /**
   * Evaluate arithmetic expression
   */
  static _evaluateArithmetic(expr, data, context) {
    // Simple arithmetic - replace $.paths with values
    let evaluable = expr;

    // Find all $.path references
    const matches = expr.match(/\$\.\w+(\.\w+)*/g);
    if (matches) {
      matches.forEach(match => {
        const value = this._evaluateExpression(match, data, context);
        evaluable = evaluable.replace(match, value);
      });
    }

    // Safely evaluate arithmetic
    try {
      return Function('"use strict"; return (' + evaluable + ')')();
    } catch (error) {
      throw new Error(`Invalid arithmetic expression: ${expr}`);
    }
  }

  /**
   * Evaluate function calls
   */
  static _evaluateFunction(expr, data, context) {
    const funcMatch = expr.match(/(\w+)\((.*)\)/);
    if (!funcMatch) {
      throw new Error(`Invalid function: ${expr}`);
    }

    const [, funcName, argsStr] = funcMatch;
    const args = argsStr.split(',').map(arg => this._evaluateExpression(arg.trim(), data, context));

    // Built-in functions
    switch (funcName.toLowerCase()) {
      case 'sum':
        return args.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

      case 'avg':
        return args.reduce((sum, val) => sum + (parseFloat(val) || 0), 0) / args.length;

      case 'min':
        return Math.min(...args.map(v => parseFloat(v) || 0));

      case 'max':
        return Math.max(...args.map(v => parseFloat(v) || 0));

      case 'count':
        return args.filter(v => v !== null && v !== undefined).length;

      case 'concat':
        return args.join('');

      case 'upper':
        return args[0]?.toString().toUpperCase();

      case 'lower':
        return args[0]?.toString().toLowerCase();

      case 'length':
        return args[0]?.length || 0;

      default:
        throw new Error(`Unknown function: ${funcName}`);
    }
  }

  /**
   * Transform dataset using JSONLex
   */
  static transformDataset(dataset, transformations) {
    const results = [];

    for (const row of dataset) {
      const transformedRow = {};

      for (const [key, expression] of Object.entries(transformations)) {
        transformedRow[key] = this.evaluate(expression, row);
      }

      results.push(transformedRow);
    }

    return results;
  }
}

module.exports = JSONLexService;
