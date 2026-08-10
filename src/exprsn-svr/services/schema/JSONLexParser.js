/**
 * ═══════════════════════════════════════════════════════════
 * JSONLex Expression Parser
 * Parse and evaluate JSONLex expressions for calculated fields
 * ═══════════════════════════════════════════════════════════
 */

class JSONLexParser {
  /**
   * Parse JSONLex expression into SQL
   */
  static parseToSQL(expression, context = {}) {
    if (!expression || typeof expression !== 'object') {
      throw new Error('Invalid JSONLex expression');
    }

    const { operator, operands = [] } = expression;

    switch (operator) {
      // Arithmetic operators
      case 'add':
      case '+':
        return this.generateSQL('ADD', operands, context);
      case 'subtract':
      case '-':
        return this.generateSQL('SUBTRACT', operands, context);
      case 'multiply':
      case '*':
        return this.generateSQL('MULTIPLY', operands, context);
      case 'divide':
      case '/':
        return this.generateSQL('DIVIDE', operands, context);
      case 'modulo':
      case '%':
        return this.generateSQL('MODULO', operands, context);

      // Comparison operators
      case 'equals':
      case '==':
        return this.generateSQL('EQUALS', operands, context);
      case 'notEquals':
      case '!=':
        return this.generateSQL('NOT_EQUALS', operands, context);
      case 'greaterThan':
      case '>':
        return this.generateSQL('GREATER_THAN', operands, context);
      case 'lessThan':
      case '<':
        return this.generateSQL('LESS_THAN', operands, context);
      case 'greaterThanOrEqual':
      case '>=':
        return this.generateSQL('GREATER_THAN_OR_EQUAL', operands, context);
      case 'lessThanOrEqual':
      case '<=':
        return this.generateSQL('LESS_THAN_OR_EQUAL', operands, context);

      // Logical operators
      case 'and':
      case '&&':
        return this.generateSQL('AND', operands, context);
      case 'or':
      case '||':
        return this.generateSQL('OR', operands, context);
      case 'not':
      case '!':
        return this.generateSQL('NOT', operands, context);

      // String functions
      case 'concat':
        return this.generateSQL('CONCAT', operands, context);
      case 'substring':
        return this.generateSQL('SUBSTRING', operands, context);
      case 'upper':
        return this.generateSQL('UPPER', operands, context);
      case 'lower':
        return this.generateSQL('LOWER', operands, context);
      case 'trim':
        return this.generateSQL('TRIM', operands, context);
      case 'length':
        return this.generateSQL('LENGTH', operands, context);

      // Date functions
      case 'now':
        return 'NOW()';
      case 'currentDate':
        return 'CURRENT_DATE';
      case 'currentTime':
        return 'CURRENT_TIME';
      case 'dateAdd':
        return this.generateSQL('DATE_ADD', operands, context);
      case 'dateDiff':
        return this.generateSQL('DATE_DIFF', operands, context);
      case 'extractYear':
        return this.generateSQL('EXTRACT_YEAR', operands, context);
      case 'extractMonth':
        return this.generateSQL('EXTRACT_MONTH', operands, context);
      case 'extractDay':
        return this.generateSQL('EXTRACT_DAY', operands, context);

      // Aggregate functions
      case 'sum':
        return this.generateSQL('SUM', operands, context);
      case 'avg':
        return this.generateSQL('AVG', operands, context);
      case 'count':
        return this.generateSQL('COUNT', operands, context);
      case 'min':
        return this.generateSQL('MIN', operands, context);
      case 'max':
        return this.generateSQL('MAX', operands, context);

      // Conditional
      case 'if':
      case 'case':
        return this.generateSQL('CASE', operands, context);

      // Field reference
      case 'field':
        return this.generateSQL('FIELD', operands, context);

      // Literal value
      case 'literal':
        return this.generateSQL('LITERAL', operands, context);

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  /**
   * Generate SQL for specific operation
   */
  static generateSQL(operation, operands, context) {
    const parsedOperands = operands.map(op => {
      if (typeof op === 'object' && op.operator) {
        return this.parseToSQL(op, context);
      }
      if (typeof op === 'string' && op.startsWith('$')) {
        // Field reference
        return this.sanitizeFieldName(op.substring(1));
      }
      return this.formatLiteral(op);
    });

    switch (operation) {
      // Arithmetic
      case 'ADD':
        return `(${parsedOperands.join(' + ')})`;
      case 'SUBTRACT':
        return `(${parsedOperands.join(' - ')})`;
      case 'MULTIPLY':
        return `(${parsedOperands.join(' * ')})`;
      case 'DIVIDE':
        return `(${parsedOperands[0]} / NULLIF(${parsedOperands[1]}, 0))`;
      case 'MODULO':
        return `(${parsedOperands[0]} % ${parsedOperands[1]})`;

      // Comparison
      case 'EQUALS':
        return `(${parsedOperands[0]} = ${parsedOperands[1]})`;
      case 'NOT_EQUALS':
        return `(${parsedOperands[0]} != ${parsedOperands[1]})`;
      case 'GREATER_THAN':
        return `(${parsedOperands[0]} > ${parsedOperands[1]})`;
      case 'LESS_THAN':
        return `(${parsedOperands[0]} < ${parsedOperands[1]})`;
      case 'GREATER_THAN_OR_EQUAL':
        return `(${parsedOperands[0]} >= ${parsedOperands[1]})`;
      case 'LESS_THAN_OR_EQUAL':
        return `(${parsedOperands[0]} <= ${parsedOperands[1]})`;

      // Logical
      case 'AND':
        return `(${parsedOperands.join(' AND ')})`;
      case 'OR':
        return `(${parsedOperands.join(' OR ')})`;
      case 'NOT':
        return `(NOT ${parsedOperands[0]})`;

      // String functions
      case 'CONCAT':
        return `CONCAT(${parsedOperands.join(', ')})`;
      case 'SUBSTRING':
        return `SUBSTRING(${parsedOperands.join(', ')})`;
      case 'UPPER':
        return `UPPER(${parsedOperands[0]})`;
      case 'LOWER':
        return `LOWER(${parsedOperands[0]})`;
      case 'TRIM':
        return `TRIM(${parsedOperands[0]})`;
      case 'LENGTH':
        return `LENGTH(${parsedOperands[0]})`;

      // Date functions
      case 'DATE_ADD':
        return `(${parsedOperands[0]} + INTERVAL '${parsedOperands[1]}')`;
      case 'DATE_DIFF':
        return `(${parsedOperands[0]} - ${parsedOperands[1]})`;
      case 'EXTRACT_YEAR':
        return `EXTRACT(YEAR FROM ${parsedOperands[0]})`;
      case 'EXTRACT_MONTH':
        return `EXTRACT(MONTH FROM ${parsedOperands[0]})`;
      case 'EXTRACT_DAY':
        return `EXTRACT(DAY FROM ${parsedOperands[0]})`;

      // Aggregate functions
      case 'SUM':
        return `SUM(${parsedOperands[0]})`;
      case 'AVG':
        return `AVG(${parsedOperands[0]})`;
      case 'COUNT':
        return `COUNT(${parsedOperands[0]})`;
      case 'MIN':
        return `MIN(${parsedOperands[0]})`;
      case 'MAX':
        return `MAX(${parsedOperands[0]})`;

      // Conditional
      case 'CASE':
        // operands: [condition, trueValue, falseValue]
        return `CASE WHEN ${parsedOperands[0]} THEN ${parsedOperands[1]} ELSE ${parsedOperands[2]} END`;

      // Field reference
      case 'FIELD':
        return this.sanitizeFieldName(parsedOperands[0]);

      // Literal
      case 'LITERAL':
        return this.formatLiteral(parsedOperands[0]);

      default:
        throw new Error(`Unsupported SQL operation: ${operation}`);
    }
  }

  /**
   * Evaluate expression with provided data
   */
  static evaluate(expression, data = {}) {
    if (!expression || typeof expression !== 'object') {
      return expression;
    }

    const { operator, operands = [] } = expression;

    // Evaluate operands first
    const evaluatedOperands = operands.map(op => {
      if (typeof op === 'object' && op.operator) {
        return this.evaluate(op, data);
      }
      if (typeof op === 'string' && op.startsWith('$')) {
        // Field reference
        const fieldName = op.substring(1);
        return this.getNestedValue(data, fieldName);
      }
      return op;
    });

    switch (operator) {
      // Arithmetic
      case 'add':
      case '+':
        return evaluatedOperands.reduce((a, b) => Number(a) + Number(b), 0);
      case 'subtract':
      case '-':
        return evaluatedOperands.reduce((a, b) => Number(a) - Number(b));
      case 'multiply':
      case '*':
        return evaluatedOperands.reduce((a, b) => Number(a) * Number(b), 1);
      case 'divide':
      case '/':
        return evaluatedOperands[1] !== 0 ? Number(evaluatedOperands[0]) / Number(evaluatedOperands[1]) : null;
      case 'modulo':
      case '%':
        return Number(evaluatedOperands[0]) % Number(evaluatedOperands[1]);

      // Comparison
      case 'equals':
      case '==':
        return evaluatedOperands[0] === evaluatedOperands[1];
      case 'notEquals':
      case '!=':
        return evaluatedOperands[0] !== evaluatedOperands[1];
      case 'greaterThan':
      case '>':
        return Number(evaluatedOperands[0]) > Number(evaluatedOperands[1]);
      case 'lessThan':
      case '<':
        return Number(evaluatedOperands[0]) < Number(evaluatedOperands[1]);
      case 'greaterThanOrEqual':
      case '>=':
        return Number(evaluatedOperands[0]) >= Number(evaluatedOperands[1]);
      case 'lessThanOrEqual':
      case '<=':
        return Number(evaluatedOperands[0]) <= Number(evaluatedOperands[1]);

      // Logical
      case 'and':
      case '&&':
        return evaluatedOperands.every(Boolean);
      case 'or':
      case '||':
        return evaluatedOperands.some(Boolean);
      case 'not':
      case '!':
        return !evaluatedOperands[0];

      // String functions
      case 'concat':
        return evaluatedOperands.map(String).join('');
      case 'substring':
        return String(evaluatedOperands[0]).substring(evaluatedOperands[1], evaluatedOperands[2]);
      case 'upper':
        return String(evaluatedOperands[0]).toUpperCase();
      case 'lower':
        return String(evaluatedOperands[0]).toLowerCase();
      case 'trim':
        return String(evaluatedOperands[0]).trim();
      case 'length':
        return String(evaluatedOperands[0]).length;

      // Date functions
      case 'now':
        return new Date();
      case 'currentDate':
        return new Date().toISOString().split('T')[0];
      case 'currentTime':
        return new Date().toISOString().split('T')[1];

      // Conditional
      case 'if':
      case 'case':
        return evaluatedOperands[0] ? evaluatedOperands[1] : evaluatedOperands[2];

      default:
        throw new Error(`Unsupported evaluation operator: ${operator}`);
    }
  }

  /**
   * Validate expression syntax
   */
  static validate(expression) {
    const errors = [];

    if (!expression || typeof expression !== 'object') {
      errors.push('Expression must be an object');
      return { valid: false, errors };
    }

    if (!expression.operator) {
      errors.push('Expression must have an operator');
      return { valid: false, errors };
    }

    if (!Array.isArray(expression.operands)) {
      errors.push('Operands must be an array');
      return { valid: false, errors };
    }

    // Validate operand count
    const requiredOperands = this.getRequiredOperandCount(expression.operator);
    if (requiredOperands && expression.operands.length !== requiredOperands) {
      errors.push(`Operator ${expression.operator} requires ${requiredOperands} operands, got ${expression.operands.length}`);
    }

    // Recursively validate nested expressions
    expression.operands.forEach((operand, index) => {
      if (typeof operand === 'object' && operand.operator) {
        const result = this.validate(operand);
        if (!result.valid) {
          errors.push(`Operand ${index}: ${result.errors.join(', ')}`);
        }
      }
    });

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get required operand count for operator
   */
  static getRequiredOperandCount(operator) {
    const counts = {
      'not': 1, '!': 1,
      'upper': 1, 'lower': 1, 'trim': 1, 'length': 1,
      'sum': 1, 'avg': 1, 'count': 1, 'min': 1, 'max': 1,
      'extractYear': 1, 'extractMonth': 1, 'extractDay': 1,

      'equals': 2, '==': 2,
      'notEquals': 2, '!=': 2,
      'greaterThan': 2, '>': 2,
      'lessThan': 2, '<': 2,
      'greaterThanOrEqual': 2, '>=': 2,
      'lessThanOrEqual': 2, '<=': 2,
      'divide': 2, '/': 2,
      'modulo': 2, '%': 2,
      'dateDiff': 2,

      'if': 3, 'case': 3,
      'substring': 3
    };

    return counts[operator] || null; // null means variable operands
  }

  /**
   * Sanitize field name for SQL
   */
  static sanitizeFieldName(fieldName) {
    // Remove any potentially dangerous characters
    const sanitized = fieldName.replace(/[^a-zA-Z0-9_]/g, '');
    return `"${sanitized}"`;
  }

  /**
   * Format literal value for SQL
   */
  static formatLiteral(value) {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    // String - escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Get nested value from object
   */
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Generate JSONLex expression from simple formula
   * Example: "price * quantity" -> JSONLex structure
   */
  static parseFormula(formula) {
    // Simple parser for basic arithmetic formulas
    // This is a simplified version - a full implementation would use a proper parser

    formula = formula.trim();

    // Handle parentheses
    if (formula.startsWith('(') && formula.endsWith(')')) {
      return this.parseFormula(formula.substring(1, formula.length - 1));
    }

    // Find operator (lowest precedence first)
    const operators = [
      { symbol: '+', jsonlex: 'add' },
      { symbol: '-', jsonlex: 'subtract' },
      { symbol: '*', jsonlex: 'multiply' },
      { symbol: '/', jsonlex: 'divide' },
      { symbol: '%', jsonlex: 'modulo' }
    ];

    for (const op of operators) {
      const index = formula.indexOf(op.symbol);
      if (index > 0) {
        const left = formula.substring(0, index).trim();
        const right = formula.substring(index + op.symbol.length).trim();

        return {
          operator: op.jsonlex,
          operands: [
            this.parseFormula(left),
            this.parseFormula(right)
          ]
        };
      }
    }

    // Check if it's a field reference (starts with $)
    if (formula.startsWith('$')) {
      return formula;
    }

    // Check if it's a number
    if (!isNaN(formula)) {
      return Number(formula);
    }

    // Otherwise treat as string literal
    return formula;
  }
}

module.exports = JSONLexParser;
