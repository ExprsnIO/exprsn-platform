/**
 * Variable Resolver Utility
 * Resolves template variables in forms and grids at runtime
 * Supports syntax: {{settings.appName}}, {{variables.userName}}, {{data.recordCount}}
 */

class VariableResolver {
  constructor(context = {}) {
    this.context = context;
  }

  /**
   * Set the context for variable resolution
   * @param {Object} context - Context object containing settings, variables, data, etc.
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Get a value from the context using dot notation
   * @param {string} path - Dot-notated path (e.g., 'settings.appName')
   * @returns {*} The resolved value or undefined
   */
  getValue(path) {
    if (!path) return undefined;

    const parts = path.split('.');
    let value = this.context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Resolve all template variables in a string
   * @param {string} template - String with template variables (e.g., "Hello {{settings.appName}}")
   * @param {Object} additionalContext - Additional context to merge
   * @returns {string} Resolved string
   */
  resolve(template, additionalContext = {}) {
    if (typeof template !== 'string') {
      return template;
    }

    // Merge additional context temporarily
    const originalContext = this.context;
    if (Object.keys(additionalContext).length > 0) {
      this.context = { ...this.context, ...additionalContext };
    }

    // Match {{variable.path}} patterns
    const resolved = template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      const value = this.getValue(trimmedPath);

      // Return the value or empty string if undefined
      if (value === undefined || value === null) {
        console.warn(`Variable not found: ${trimmedPath}`);
        return '';
      }

      // Convert to string if needed
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      return String(value);
    });

    // Restore original context
    this.context = originalContext;

    return resolved;
  }

  /**
   * Resolve variables in an object recursively
   * @param {Object} obj - Object to resolve
   * @param {Object} additionalContext - Additional context
   * @returns {Object} Resolved object
   */
  resolveObject(obj, additionalContext = {}) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.resolve(obj, additionalContext);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, additionalContext));
    }

    if (typeof obj === 'object') {
      const resolved = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          resolved[key] = this.resolveObject(obj[key], additionalContext);
        }
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Check if a string contains template variables
   * @param {string} str - String to check
   * @returns {boolean} True if contains variables
   */
  hasVariables(str) {
    if (typeof str !== 'string') return false;
    return /\{\{([^}]+)\}\}/.test(str);
  }

  /**
   * Get all variable paths in a string
   * @param {string} str - String to analyze
   * @returns {Array<string>} Array of variable paths
   */
  extractVariables(str) {
    if (typeof str !== 'string') return [];

    const variables = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = regex.exec(str)) !== null) {
      variables.push(match[1].trim());
    }

    return variables;
  }

  /**
   * Evaluate a simple expression with context
   * @param {string} expression - Expression to evaluate
   * @param {Object} additionalContext - Additional context
   * @returns {*} Result of expression
   */
  evaluate(expression, additionalContext = {}) {
    const context = { ...this.context, ...additionalContext };

    try {
      // Create a function with context variables as parameters
      const contextKeys = Object.keys(context);
      const contextValues = contextKeys.map(key => context[key]);

      // Create function that evaluates the expression
      const func = new Function(...contextKeys, `return ${expression}`);
      return func(...contextValues);
    } catch (error) {
      console.error('Expression evaluation error:', error);
      return undefined;
    }
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VariableResolver;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.VariableResolver = VariableResolver;
}
