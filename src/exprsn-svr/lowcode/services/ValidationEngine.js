/**
 * ═══════════════════════════════════════════════════════════
 * Validation Engine - Comprehensive Data Validation
 * Supports built-in rules, custom validators, async validation,
 * cross-field validation, and conditional rules
 * ═══════════════════════════════════════════════════════════
 */

class ValidationEngine {
  constructor() {
    // Built-in validation rules
    this.rules = {
      // Basic validators
      required: {
        validate: (value) => {
          if (value === null || value === undefined) return false;
          if (typeof value === 'string') return value.trim().length > 0;
          if (Array.isArray(value)) return value.length > 0;
          return true;
        },
        message: 'This field is required'
      },

      // String validators
      minLength: {
        validate: (value, min) => !value || value.length >= min,
        message: (min) => `Minimum length is ${min} characters`
      },

      maxLength: {
        validate: (value, max) => !value || value.length <= max,
        message: (max) => `Maximum length is ${max} characters`
      },

      pattern: {
        validate: (value, pattern) => {
          if (!value) return true;
          const regex = new RegExp(pattern);
          return regex.test(value);
        },
        message: 'Invalid format'
      },

      email: {
        validate: (value) => {
          if (!value) return true;
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value);
        },
        message: 'Invalid email address'
      },

      url: {
        validate: (value) => {
          if (!value) return true;
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        message: 'Invalid URL'
      },

      alpha: {
        validate: (value) => !value || /^[a-zA-Z]+$/.test(value),
        message: 'Only letters are allowed'
      },

      alphanumeric: {
        validate: (value) => !value || /^[a-zA-Z0-9]+$/.test(value),
        message: 'Only letters and numbers are allowed'
      },

      // Number validators
      min: {
        validate: (value, min) => value === null || value === undefined || Number(value) >= min,
        message: (min) => `Minimum value is ${min}`
      },

      max: {
        validate: (value, max) => value === null || value === undefined || Number(value) <= max,
        message: (max) => `Maximum value is ${max}`
      },

      integer: {
        validate: (value) => !value || Number.isInteger(Number(value)),
        message: 'Must be an integer'
      },

      positive: {
        validate: (value) => !value || Number(value) > 0,
        message: 'Must be a positive number'
      },

      negative: {
        validate: (value) => !value || Number(value) < 0,
        message: 'Must be a negative number'
      },

      // Date validators
      date: {
        validate: (value) => {
          if (!value) return true;
          const date = new Date(value);
          return !isNaN(date.getTime());
        },
        message: 'Invalid date'
      },

      minDate: {
        validate: (value, minDate) => {
          if (!value) return true;
          return new Date(value) >= new Date(minDate);
        },
        message: (minDate) => `Date must be on or after ${minDate}`
      },

      maxDate: {
        validate: (value, maxDate) => {
          if (!value) return true;
          return new Date(value) <= new Date(maxDate);
        },
        message: (maxDate) => `Date must be on or before ${maxDate}`
      },

      // Array validators
      minItems: {
        validate: (value, min) => !value || (Array.isArray(value) && value.length >= min),
        message: (min) => `Minimum ${min} items required`
      },

      maxItems: {
        validate: (value, max) => !value || (Array.isArray(value) && value.length <= max),
        message: (max) => `Maximum ${max} items allowed`
      },

      uniqueItems: {
        validate: (value) => {
          if (!Array.isArray(value)) return true;
          return new Set(value).size === value.length;
        },
        message: 'All items must be unique'
      },

      // File validators
      fileType: {
        validate: (file, allowedTypes) => {
          if (!file) return true;
          if (!file.type) return false;
          const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
          return types.some(type => {
            if (type.endsWith('/*')) {
              return file.type.startsWith(type.replace('/*', ''));
            }
            return file.type === type;
          });
        },
        message: (types) => `Allowed file types: ${Array.isArray(types) ? types.join(', ') : types}`
      },

      fileSize: {
        validate: (file, maxSize) => {
          if (!file) return true;
          return file.size <= maxSize;
        },
        message: (maxSize) => `Maximum file size is ${this.formatFileSize(maxSize)}`
      },

      // Custom validators
      custom: {
        validate: async (value, validatorFn) => {
          return await validatorFn(value);
        },
        message: 'Validation failed'
      },

      // Cross-field validators
      matches: {
        validate: (value, fieldName, allData) => {
          return value === allData[fieldName];
        },
        message: (fieldName) => `Must match ${fieldName}`
      },

      notMatches: {
        validate: (value, fieldName, allData) => {
          return value !== allData[fieldName];
        },
        message: (fieldName) => `Must not match ${fieldName}`
      }
    };

    // Async validator cache
    this.asyncCache = new Map();
  }

  /**
   * Validate a single field
   */
  async validateField(control, value, allData = {}) {
    const errors = [];

    // Get validation rules from control
    const rules = control.validationRules || control.validation || [];

    for (const rule of rules) {
      // Skip if rule is conditional and condition not met
      if (rule.condition && !this.evaluateCondition(rule.condition, allData)) {
        continue;
      }

      try {
        const isValid = await this.executeRule(rule, value, allData);

        if (!isValid) {
          errors.push({
            rule: rule.type || rule.name,
            message: rule.message || this.getRuleMessage(rule, value),
            level: rule.level || 'error' // error, warning, info
          });

          // Stop on first error if configured
          if (rule.stopOnError) {
            break;
          }
        }
      } catch (error) {
        console.error('[ValidationEngine] Error executing rule:', error);
        errors.push({
          rule: rule.type || rule.name,
          message: 'Validation error occurred',
          level: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Execute a validation rule
   */
  async executeRule(rule, value, allData) {
    const ruleType = rule.type || rule.name;
    const validator = this.rules[ruleType];

    if (!validator) {
      console.warn(`[ValidationEngine] Unknown rule type: ${ruleType}`);
      return true; // Unknown rules pass by default
    }

    // Handle async validators with caching
    if (rule.async) {
      const cacheKey = `${ruleType}_${JSON.stringify(value)}`;
      if (this.asyncCache.has(cacheKey)) {
        return this.asyncCache.get(cacheKey);
      }

      const result = await validator.validate(value, rule.param, allData);
      this.asyncCache.set(cacheKey, result);

      // Clear cache after TTL (default 60 seconds)
      setTimeout(() => {
        this.asyncCache.delete(cacheKey);
      }, rule.cacheTtl || 60000);

      return result;
    }

    // Synchronous validation
    return validator.validate(value, rule.param, allData);
  }

  /**
   * Get error message for rule
   */
  getRuleMessage(rule, value) {
    const ruleType = rule.type || rule.name;
    const validator = this.rules[ruleType];

    if (!validator) return 'Validation failed';

    if (typeof validator.message === 'function') {
      return validator.message(rule.param, value);
    }

    return validator.message;
  }

  /**
   * Validate form-level rules (cross-field validation)
   */
  async validateFormRules(formRules, data) {
    const errors = [];

    for (const rule of formRules) {
      try {
        // Evaluate rule condition
        const isValid = await this.evaluateFormRule(rule, data);

        if (!isValid) {
          errors.push({
            rule: rule.name,
            message: rule.message || 'Form validation failed',
            level: rule.level || 'error',
            fields: rule.fields || []
          });
        }
      } catch (error) {
        console.error('[ValidationEngine] Error executing form rule:', error);
        errors.push({
          rule: rule.name,
          message: 'Form validation error occurred',
          level: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Evaluate form-level rule
   */
  async evaluateFormRule(rule, data) {
    // Handle different rule types
    switch (rule.type) {
      case 'expression':
        // Evaluate JavaScript expression
        return this.evaluateExpression(rule.expression, data);

      case 'function':
        // Execute custom validation function
        return await rule.validator(data);

      case 'comparison':
        // Compare two fields
        return this.compareFields(rule.field1, rule.operator, rule.field2, data);

      case 'sum':
        // Validate sum of fields
        return this.validateSum(rule.fields, rule.operator, rule.value, data);

      default:
        console.warn(`[ValidationEngine] Unknown form rule type: ${rule.type}`);
        return true;
    }
  }

  /**
   * Evaluate conditional rule
   */
  evaluateCondition(condition, data) {
    if (!condition) return true;

    const fieldValue = data[condition.field];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'notEquals':
        return fieldValue !== condition.value;
      case 'contains':
        return String(fieldValue).includes(condition.value);
      case 'isEmpty':
        return !fieldValue || fieldValue === '';
      case 'isNotEmpty':
        return !!fieldValue && fieldValue !== '';
      case 'greaterThan':
        return Number(fieldValue) > Number(condition.value);
      case 'lessThan':
        return Number(fieldValue) < Number(condition.value);
      default:
        return true;
    }
  }

  /**
   * Evaluate JavaScript expression safely
   */
  evaluateExpression(expression, data) {
    try {
      // Create a safe context
      const context = { ...data };

      // Use Function constructor for evaluation (safer than eval)
      const func = new Function(...Object.keys(context), `return ${expression}`);
      return func(...Object.values(context));
    } catch (error) {
      console.error('[ValidationEngine] Error evaluating expression:', error);
      return false;
    }
  }

  /**
   * Compare two fields
   */
  compareFields(field1, operator, field2, data) {
    const value1 = data[field1];
    const value2 = data[field2];

    switch (operator) {
      case 'equals':
        return value1 === value2;
      case 'notEquals':
        return value1 !== value2;
      case 'greaterThan':
        return Number(value1) > Number(value2);
      case 'lessThan':
        return Number(value1) < Number(value2);
      case 'greaterThanOrEqual':
        return Number(value1) >= Number(value2);
      case 'lessThanOrEqual':
        return Number(value1) <= Number(value2);
      default:
        return false;
    }
  }

  /**
   * Validate sum of fields
   */
  validateSum(fields, operator, expectedValue, data) {
    const sum = fields.reduce((acc, field) => {
      return acc + (Number(data[field]) || 0);
    }, 0);

    switch (operator) {
      case 'equals':
        return sum === Number(expectedValue);
      case 'lessThan':
        return sum < Number(expectedValue);
      case 'greaterThan':
        return sum > Number(expectedValue);
      case 'lessThanOrEqual':
        return sum <= Number(expectedValue);
      case 'greaterThanOrEqual':
        return sum >= Number(expectedValue);
      default:
        return false;
    }
  }

  /**
   * Add custom validator
   */
  addValidator(name, validator, message) {
    this.rules[name] = {
      validate: validator,
      message
    };
  }

  /**
   * Format file size for messages
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Clear async validation cache
   */
  clearCache() {
    this.asyncCache.clear();
  }
}

module.exports = ValidationEngine;
