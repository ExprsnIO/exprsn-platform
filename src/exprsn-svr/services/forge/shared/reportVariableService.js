/**
 * Report Variable Service
 * Manages definable variables/parameters for dynamic reports
 */

const logger = require('../../../utils/logger');
const moment = require('moment-timezone');

class ReportVariableService {
  constructor() {
    // Built-in variable types
    this.variableTypes = {
      DATE: 'date',
      DATE_RANGE: 'date_range',
      NUMBER: 'number',
      TEXT: 'text',
      SELECT: 'select',
      MULTI_SELECT: 'multi_select',
      BOOLEAN: 'boolean',
      USER: 'user',
      DEPARTMENT: 'department',
      ACCOUNT: 'account',
      CURRENCY: 'currency',
      DYNAMIC: 'dynamic' // Computed at runtime
    };

    // Built-in dynamic variables
    this.dynamicVariables = {
      // Date variables
      TODAY: () => moment().format('YYYY-MM-DD'),
      YESTERDAY: () => moment().subtract(1, 'day').format('YYYY-MM-DD'),
      TOMORROW: () => moment().add(1, 'day').format('YYYY-MM-DD'),
      THIS_WEEK_START: () => moment().startOf('week').format('YYYY-MM-DD'),
      THIS_WEEK_END: () => moment().endOf('week').format('YYYY-MM-DD'),
      LAST_WEEK_START: () => moment().subtract(1, 'week').startOf('week').format('YYYY-MM-DD'),
      LAST_WEEK_END: () => moment().subtract(1, 'week').endOf('week').format('YYYY-MM-DD'),
      THIS_MONTH_START: () => moment().startOf('month').format('YYYY-MM-DD'),
      THIS_MONTH_END: () => moment().endOf('month').format('YYYY-MM-DD'),
      LAST_MONTH_START: () => moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
      LAST_MONTH_END: () => moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      THIS_QUARTER_START: () => moment().startOf('quarter').format('YYYY-MM-DD'),
      THIS_QUARTER_END: () => moment().endOf('quarter').format('YYYY-MM-DD'),
      LAST_QUARTER_START: () => moment().subtract(1, 'quarter').startOf('quarter').format('YYYY-MM-DD'),
      LAST_QUARTER_END: () => moment().subtract(1, 'quarter').endOf('quarter').format('YYYY-MM-DD'),
      THIS_YEAR_START: () => moment().startOf('year').format('YYYY-MM-DD'),
      THIS_YEAR_END: () => moment().endOf('year').format('YYYY-MM-DD'),
      LAST_YEAR_START: () => moment().subtract(1, 'year').startOf('year').format('YYYY-MM-DD'),
      LAST_YEAR_END: () => moment().subtract(1, 'year').endOf('year').format('YYYY-MM-DD'),

      // Number variables
      CURRENT_YEAR: () => moment().year(),
      CURRENT_MONTH: () => moment().month() + 1,
      CURRENT_DAY: () => moment().date(),
      CURRENT_QUARTER: () => moment().quarter(),

      // User variables (require context)
      CURRENT_USER_ID: (context) => context?.userId || null,
      CURRENT_USER_DEPARTMENT: (context) => context?.userDepartment || null
    };
  }

  /**
   * Define a variable for a report
   */
  defineVariable(variable) {
    const schema = {
      name: variable.name, // Variable name (e.g., "start_date")
      label: variable.label, // Display label (e.g., "Start Date")
      type: variable.type, // Variable type from variableTypes
      description: variable.description || null,
      defaultValue: variable.defaultValue || null,
      required: variable.required !== false,

      // Type-specific options
      options: variable.options || null, // For SELECT/MULTI_SELECT
      min: variable.min || null, // For NUMBER/DATE
      max: variable.max || null, // For NUMBER/DATE
      format: variable.format || null, // For DATE (e.g., "YYYY-MM-DD")
      placeholder: variable.placeholder || null,

      // Validation
      validation: variable.validation || null, // Joi schema or custom validator

      // Dynamic variable reference
      dynamicRef: variable.dynamicRef || null, // Reference to dynamic variable

      // Dependencies (show/hide based on other variables)
      dependsOn: variable.dependsOn || null,

      // Metadata
      order: variable.order || 0,
      category: variable.category || 'general'
    };

    return schema;
  }

  /**
   * Resolve variable values (substitute dynamic variables)
   */
  resolveVariables(variables, userValues = {}, context = {}) {
    const resolved = {};

    for (const [name, variable] of Object.entries(variables)) {
      // Use user-provided value if available
      if (userValues[name] !== undefined) {
        resolved[name] = userValues[name];
        continue;
      }

      // Check if it's a dynamic variable reference
      if (variable.dynamicRef && this.dynamicVariables[variable.dynamicRef]) {
        const dynamicFn = this.dynamicVariables[variable.dynamicRef];
        resolved[name] = dynamicFn(context);
        continue;
      }

      // Use default value
      if (variable.defaultValue !== null) {
        // If default is a dynamic reference (e.g., "@TODAY")
        if (typeof variable.defaultValue === 'string' && variable.defaultValue.startsWith('@')) {
          const refName = variable.defaultValue.substring(1);
          if (this.dynamicVariables[refName]) {
            resolved[name] = this.dynamicVariables[refName](context);
            continue;
          }
        }

        resolved[name] = variable.defaultValue;
        continue;
      }

      // If required and no value, throw error
      if (variable.required) {
        throw new Error(`Required variable '${name}' has no value`);
      }
    }

    return resolved;
  }

  /**
   * Validate variable values
   */
  validateVariables(variables, values) {
    const errors = [];

    for (const [name, variable] of Object.entries(variables)) {
      const value = values[name];

      // Check required
      if (variable.required && (value === undefined || value === null || value === '')) {
        errors.push({
          variable: name,
          error: 'REQUIRED',
          message: `${variable.label || name} is required`
        });
        continue;
      }

      // Skip validation if no value and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type-specific validation
      switch (variable.type) {
        case this.variableTypes.NUMBER:
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push({
              variable: name,
              error: 'INVALID_TYPE',
              message: `${variable.label || name} must be a number`
            });
          } else {
            if (variable.min !== null && value < variable.min) {
              errors.push({
                variable: name,
                error: 'MIN_VALUE',
                message: `${variable.label || name} must be at least ${variable.min}`
              });
            }
            if (variable.max !== null && value > variable.max) {
              errors.push({
                variable: name,
                error: 'MAX_VALUE',
                message: `${variable.label || name} must be at most ${variable.max}`
              });
            }
          }
          break;

        case this.variableTypes.DATE:
          if (!moment(value, variable.format || 'YYYY-MM-DD', true).isValid()) {
            errors.push({
              variable: name,
              error: 'INVALID_DATE',
              message: `${variable.label || name} is not a valid date`
            });
          }
          break;

        case this.variableTypes.DATE_RANGE:
          if (!value.startDate || !value.endDate) {
            errors.push({
              variable: name,
              error: 'INVALID_RANGE',
              message: `${variable.label || name} requires both startDate and endDate`
            });
          } else if (moment(value.endDate).isBefore(value.startDate)) {
            errors.push({
              variable: name,
              error: 'INVALID_RANGE',
              message: `End date must be after start date`
            });
          }
          break;

        case this.variableTypes.SELECT:
          if (variable.options && !variable.options.some(opt => opt.value === value)) {
            errors.push({
              variable: name,
              error: 'INVALID_OPTION',
              message: `${variable.label || name} has an invalid option`
            });
          }
          break;

        case this.variableTypes.MULTI_SELECT:
          if (!Array.isArray(value)) {
            errors.push({
              variable: name,
              error: 'INVALID_TYPE',
              message: `${variable.label || name} must be an array`
            });
          } else if (variable.options) {
            const validValues = variable.options.map(opt => opt.value);
            const invalidValues = value.filter(v => !validValues.includes(v));
            if (invalidValues.length > 0) {
              errors.push({
                variable: name,
                error: 'INVALID_OPTION',
                message: `${variable.label || name} contains invalid options: ${invalidValues.join(', ')}`
              });
            }
          }
          break;
      }

      // Custom validation
      if (variable.validation && typeof variable.validation === 'function') {
        try {
          const result = variable.validation(value);
          if (result !== true) {
            errors.push({
              variable: name,
              error: 'CUSTOM_VALIDATION',
              message: result || 'Validation failed'
            });
          }
        } catch (err) {
          errors.push({
            variable: name,
            error: 'VALIDATION_ERROR',
            message: err.message
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a date range variable
   */
  createDateRangeVariable(name, label, options = {}) {
    return this.defineVariable({
      name,
      label,
      type: this.variableTypes.DATE_RANGE,
      description: options.description,
      defaultValue: options.defaultValue || {
        startDate: '@THIS_MONTH_START',
        endDate: '@THIS_MONTH_END'
      },
      required: options.required !== false,
      category: options.category || 'filters'
    });
  }

  /**
   * Create a select variable with options
   */
  createSelectVariable(name, label, options, config = {}) {
    return this.defineVariable({
      name,
      label,
      type: this.variableTypes.SELECT,
      description: config.description,
      options: options.map(opt =>
        typeof opt === 'string' ? { label: opt, value: opt } : opt
      ),
      defaultValue: config.defaultValue,
      required: config.required !== false,
      category: config.category || 'filters'
    });
  }

  /**
   * Create a user selection variable
   */
  createUserVariable(name, label, config = {}) {
    return this.defineVariable({
      name,
      label,
      type: this.variableTypes.USER,
      description: config.description || 'Select user',
      dynamicRef: config.currentUser ? 'CURRENT_USER_ID' : null,
      defaultValue: config.currentUser ? '@CURRENT_USER_ID' : config.defaultValue,
      required: config.required !== false,
      category: config.category || 'filters'
    });
  }

  /**
   * Substitute variables in text (template strings)
   * Example: "Sales for {{start_date}} to {{end_date}}"
   */
  substituteInText(text, variables) {
    let result = text;

    for (const [name, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
      result = result.replace(regex, this.formatValue(value));
    }

    return result;
  }

  /**
   * Format value for display
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      if (value.startDate && value.endDate) {
        return `${value.startDate} to ${value.endDate}`;
      }
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Get all available dynamic variables
   */
  getAvailableDynamicVariables(context = {}) {
    const variables = {};

    for (const [name, fn] of Object.entries(this.dynamicVariables)) {
      try {
        variables[name] = {
          name,
          value: fn(context),
          description: this.getDynamicVariableDescription(name)
        };
      } catch (err) {
        logger.warn('Failed to evaluate dynamic variable', {
          variable: name,
          error: err.message
        });
      }
    }

    return variables;
  }

  /**
   * Get description for dynamic variable
   */
  getDynamicVariableDescription(name) {
    const descriptions = {
      TODAY: "Today's date",
      YESTERDAY: "Yesterday's date",
      TOMORROW: "Tomorrow's date",
      THIS_WEEK_START: 'Start of current week',
      THIS_WEEK_END: 'End of current week',
      LAST_WEEK_START: 'Start of last week',
      LAST_WEEK_END: 'End of last week',
      THIS_MONTH_START: 'Start of current month',
      THIS_MONTH_END: 'End of current month',
      LAST_MONTH_START: 'Start of last month',
      LAST_MONTH_END: 'End of last month',
      THIS_QUARTER_START: 'Start of current quarter',
      THIS_QUARTER_END: 'End of current quarter',
      LAST_QUARTER_START: 'Start of last quarter',
      LAST_QUARTER_END: 'End of last quarter',
      THIS_YEAR_START: 'Start of current year',
      THIS_YEAR_END: 'End of current year',
      LAST_YEAR_START: 'Start of last year',
      LAST_YEAR_END: 'End of last year',
      CURRENT_YEAR: 'Current year number',
      CURRENT_MONTH: 'Current month number',
      CURRENT_DAY: 'Current day of month',
      CURRENT_QUARTER: 'Current quarter number',
      CURRENT_USER_ID: 'Current logged-in user ID',
      CURRENT_USER_DEPARTMENT: 'Current user department ID'
    };

    return descriptions[name] || name;
  }

  /**
   * Create common report variables
   */
  createCommonVariables(module = 'general') {
    const variables = {
      date_range: this.createDateRangeVariable(
        'date_range',
        'Date Range',
        {
          description: 'Select the date range for the report',
          category: 'filters'
        }
      )
    };

    switch (module) {
      case 'crm':
        Object.assign(variables, {
          assigned_to: this.createUserVariable('assigned_to', 'Assigned To', {
            description: 'Filter by assigned user',
            required: false
          }),
          status: this.createSelectVariable('status', 'Status', [
            { label: 'All', value: 'all' },
            { label: 'Open', value: 'open' },
            { label: 'Closed', value: 'closed' }
          ], {
            defaultValue: 'all'
          })
        });
        break;

      case 'erp':
        Object.assign(variables, {
          department: this.defineVariable({
            name: 'department',
            label: 'Department',
            type: this.variableTypes.DEPARTMENT,
            description: 'Filter by department',
            required: false,
            category: 'filters'
          }),
          account_type: this.createSelectVariable('account_type', 'Account Type', [
            { label: 'All', value: 'all' },
            { label: 'Asset', value: 'asset' },
            { label: 'Liability', value: 'liability' },
            { label: 'Equity', value: 'equity' },
            { label: 'Revenue', value: 'revenue' },
            { label: 'Expense', value: 'expense' }
          ], {
            defaultValue: 'all',
            required: false
          })
        });
        break;

      case 'groupware':
        Object.assign(variables, {
          project_id: this.defineVariable({
            name: 'project_id',
            label: 'Project',
            type: this.variableTypes.SELECT,
            description: 'Filter by project',
            required: false,
            category: 'filters'
          }),
          task_status: this.createSelectVariable('task_status', 'Task Status', [
            { label: 'All', value: 'all' },
            { label: 'Pending', value: 'pending' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Completed', value: 'completed' },
            { label: 'Cancelled', value: 'cancelled' }
          ], {
            defaultValue: 'all',
            required: false
          })
        });
        break;
    }

    return variables;
  }
}

module.exports = new ReportVariableService();
