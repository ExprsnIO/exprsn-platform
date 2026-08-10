/**
 * Report Formatting Service
 * Handles conditional formatting rules for reports
 * Supports cell-level, row-level, and column-level formatting
 */

const logger = require('../../../utils/logger');

class ReportFormattingService {
  constructor() {
    // Supported formatting rule types
    this.ruleTypes = {
      VALUE_COMPARISON: 'value_comparison',
      VALUE_RANGE: 'value_range',
      TEXT_CONTAINS: 'text_contains',
      TEXT_MATCH: 'text_match',
      DATE_COMPARISON: 'date_comparison',
      DUPLICATE_VALUES: 'duplicate_values',
      TOP_BOTTOM: 'top_bottom',
      ABOVE_BELOW_AVERAGE: 'above_below_average',
      COLOR_SCALE: 'color_scale',
      DATA_BARS: 'data_bars',
      ICON_SET: 'icon_set',
      CUSTOM_FORMULA: 'custom_formula'
    };

    // Comparison operators
    this.operators = {
      EQUALS: 'eq',
      NOT_EQUALS: 'neq',
      GREATER_THAN: 'gt',
      GREATER_THAN_OR_EQUAL: 'gte',
      LESS_THAN: 'lt',
      LESS_THAN_OR_EQUAL: 'lte',
      BETWEEN: 'between',
      NOT_BETWEEN: 'not_between',
      CONTAINS: 'contains',
      NOT_CONTAINS: 'not_contains',
      STARTS_WITH: 'starts_with',
      ENDS_WITH: 'ends_with',
      IS_EMPTY: 'is_empty',
      IS_NOT_EMPTY: 'is_not_empty'
    };

    // Icon sets
    this.iconSets = {
      ARROWS: ['⬆️', '➡️', '⬇️'],
      TRAFFIC_LIGHTS: ['🟢', '🟡', '🔴'],
      FLAGS: ['🟢', '🟡', '🔴'],
      STARS: ['⭐', '⭐⭐', '⭐⭐⭐'],
      RATING: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐']
    };

    // Color scales
    this.colorScales = {
      RED_YELLOW_GREEN: ['#dc3545', '#ffc107', '#28a745'],
      RED_WHITE_GREEN: ['#dc3545', '#ffffff', '#28a745'],
      BLUE_WHITE_RED: ['#0d6efd', '#ffffff', '#dc3545'],
      GREEN_WHITE_RED: ['#28a745', '#ffffff', '#dc3545']
    };
  }

  /**
   * Apply formatting rules to report data
   */
  applyFormatting(data, formattingRules = [], options = {}) {
    try {
      if (!Array.isArray(data) || !formattingRules.length) {
        return data;
      }

      // Apply each rule to the data
      let formattedData = data.map(row => ({ ...row, _formatting: {} }));

      formattingRules.forEach(rule => {
        formattedData = this.applyRule(formattedData, rule, options);
      });

      logger.debug('Formatting applied', {
        rows: data.length,
        rulesApplied: formattingRules.length
      });

      return formattedData;
    } catch (error) {
      logger.error('Failed to apply formatting', { error: error.message });
      throw error;
    }
  }

  /**
   * Apply a single formatting rule
   */
  applyRule(data, rule, options = {}) {
    const {
      type,
      field,
      condition,
      formatting,
      scope = 'cell' // cell, row, column
    } = rule;

    switch (type) {
      case this.ruleTypes.VALUE_COMPARISON:
        return this.applyValueComparison(data, field, condition, formatting, scope);

      case this.ruleTypes.VALUE_RANGE:
        return this.applyValueRange(data, field, condition, formatting, scope);

      case this.ruleTypes.TEXT_CONTAINS:
        return this.applyTextContains(data, field, condition, formatting, scope);

      case this.ruleTypes.TEXT_MATCH:
        return this.applyTextMatch(data, field, condition, formatting, scope);

      case this.ruleTypes.DATE_COMPARISON:
        return this.applyDateComparison(data, field, condition, formatting, scope);

      case this.ruleTypes.DUPLICATE_VALUES:
        return this.applyDuplicateValues(data, field, formatting, scope);

      case this.ruleTypes.TOP_BOTTOM:
        return this.applyTopBottom(data, field, condition, formatting, scope);

      case this.ruleTypes.ABOVE_BELOW_AVERAGE:
        return this.applyAboveBelowAverage(data, field, condition, formatting, scope);

      case this.ruleTypes.COLOR_SCALE:
        return this.applyColorScale(data, field, condition, scope);

      case this.ruleTypes.DATA_BARS:
        return this.applyDataBars(data, field, condition, scope);

      case this.ruleTypes.ICON_SET:
        return this.applyIconSet(data, field, condition, scope);

      case this.ruleTypes.CUSTOM_FORMULA:
        return this.applyCustomFormula(data, condition, formatting, scope);

      default:
        logger.warn('Unknown rule type', { type });
        return data;
    }
  }

  /**
   * Apply value comparison formatting
   */
  applyValueComparison(data, field, condition, formatting, scope) {
    const { operator, value } = condition;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);
      let matches = false;

      switch (operator) {
        case this.operators.EQUALS:
          matches = cellValue == value;
          break;
        case this.operators.NOT_EQUALS:
          matches = cellValue != value;
          break;
        case this.operators.GREATER_THAN:
          matches = cellValue > value;
          break;
        case this.operators.GREATER_THAN_OR_EQUAL:
          matches = cellValue >= value;
          break;
        case this.operators.LESS_THAN:
          matches = cellValue < value;
          break;
        case this.operators.LESS_THAN_OR_EQUAL:
          matches = cellValue <= value;
          break;
      }

      if (matches) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply value range formatting
   */
  applyValueRange(data, field, condition, formatting, scope) {
    const { min, max } = condition;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);

      if (cellValue >= min && cellValue <= max) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply text contains formatting
   */
  applyTextContains(data, field, condition, formatting, scope) {
    const { text, caseSensitive = false } = condition;

    return data.map(row => {
      const cellValue = String(this.getNestedValue(row, field) || '');
      const searchText = caseSensitive ? text : text.toLowerCase();
      const compareValue = caseSensitive ? cellValue : cellValue.toLowerCase();

      if (compareValue.includes(searchText)) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply text match formatting (regex)
   */
  applyTextMatch(data, field, condition, formatting, scope) {
    const { pattern, flags = 'i' } = condition;
    const regex = new RegExp(pattern, flags);

    return data.map(row => {
      const cellValue = String(this.getNestedValue(row, field) || '');

      if (regex.test(cellValue)) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply date comparison formatting
   */
  applyDateComparison(data, field, condition, formatting, scope) {
    const { operator, date } = condition;
    const compareDate = new Date(date);

    return data.map(row => {
      const cellValue = new Date(this.getNestedValue(row, field));
      let matches = false;

      switch (operator) {
        case this.operators.EQUALS:
          matches = cellValue.toDateString() === compareDate.toDateString();
          break;
        case this.operators.GREATER_THAN:
          matches = cellValue > compareDate;
          break;
        case this.operators.LESS_THAN:
          matches = cellValue < compareDate;
          break;
      }

      if (matches) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply duplicate values highlighting
   */
  applyDuplicateValues(data, field, formatting, scope) {
    const valueCounts = {};

    // Count occurrences
    data.forEach(row => {
      const value = this.getNestedValue(row, field);
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    });

    // Apply formatting to duplicates
    return data.map(row => {
      const value = this.getNestedValue(row, field);

      if (valueCounts[value] > 1) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }

      return row;
    });
  }

  /**
   * Apply top/bottom N formatting
   */
  applyTopBottom(data, field, condition, formatting, scope) {
    const { type, count } = condition; // type: 'top' or 'bottom'

    // Get all values and sort
    const values = data.map(row => ({
      row,
      value: this.getNestedValue(row, field)
    })).filter(item => typeof item.value === 'number');

    values.sort((a, b) => type === 'top' ? b.value - a.value : a.value - b.value);

    // Get top/bottom N
    const targetRows = values.slice(0, count).map(item => item.row);

    return data.map(row => {
      if (targetRows.includes(row)) {
        this.applyFormattingToRow(row, field, formatting, scope);
      }
      return row;
    });
  }

  /**
   * Apply above/below average formatting
   */
  applyAboveBelowAverage(data, field, condition, formatting, scope) {
    const { type } = condition; // type: 'above' or 'below'

    // Calculate average
    const values = data
      .map(row => this.getNestedValue(row, field))
      .filter(v => typeof v === 'number');

    const average = values.reduce((sum, v) => sum + v, 0) / values.length;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);

      if (typeof cellValue === 'number') {
        const matches = type === 'above' ? cellValue > average : cellValue < average;

        if (matches) {
          this.applyFormattingToRow(row, field, formatting, scope);
        }
      }

      return row;
    });
  }

  /**
   * Apply color scale formatting
   */
  applyColorScale(data, field, condition, scope) {
    const { colorScale = 'RED_YELLOW_GREEN' } = condition;
    const colors = this.colorScales[colorScale] || this.colorScales.RED_YELLOW_GREEN;

    // Get min and max values
    const values = data
      .map(row => this.getNestedValue(row, field))
      .filter(v => typeof v === 'number');

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);

      if (typeof cellValue === 'number') {
        // Calculate position in range (0 to 1)
        const position = (cellValue - min) / range;

        // Get color based on position
        const color = this.interpolateColor(colors, position);

        this.applyFormattingToRow(row, field, {
          backgroundColor: color
        }, scope);
      }

      return row;
    });
  }

  /**
   * Apply data bars formatting
   */
  applyDataBars(data, field, condition, scope) {
    const { color = '#0d6efd', showValue = true } = condition;

    // Get min and max values
    const values = data
      .map(row => this.getNestedValue(row, field))
      .filter(v => typeof v === 'number');

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);

      if (typeof cellValue === 'number') {
        const percentage = ((cellValue - min) / range) * 100;

        this.applyFormattingToRow(row, field, {
          dataBar: {
            width: `${percentage}%`,
            color,
            showValue
          }
        }, scope);
      }

      return row;
    });
  }

  /**
   * Apply icon set formatting
   */
  applyIconSet(data, field, condition, scope) {
    const { iconSet = 'TRAFFIC_LIGHTS', thresholds } = condition;
    const icons = this.iconSets[iconSet] || this.iconSets.TRAFFIC_LIGHTS;

    return data.map(row => {
      const cellValue = this.getNestedValue(row, field);

      if (typeof cellValue === 'number') {
        let icon = icons[0];

        if (thresholds) {
          // Use custom thresholds
          for (let i = thresholds.length - 1; i >= 0; i--) {
            if (cellValue >= thresholds[i]) {
              icon = icons[i];
              break;
            }
          }
        }

        this.applyFormattingToRow(row, field, { icon }, scope);
      }

      return row;
    });
  }

  /**
   * Apply custom formula formatting
   */
  applyCustomFormula(data, condition, formatting, scope) {
    const { formula } = condition;

    return data.map(row => {
      try {
        // Safely evaluate formula with row context
        const matches = this.evaluateFormula(formula, row);

        if (matches) {
          this.applyFormattingToRow(row, null, formatting, scope);
        }
      } catch (error) {
        logger.warn('Failed to evaluate formula', { formula, error: error.message });
      }

      return row;
    });
  }

  /**
   * Apply formatting to a row
   */
  applyFormattingToRow(row, field, formatting, scope) {
    if (!row._formatting) {
      row._formatting = {};
    }

    switch (scope) {
      case 'cell':
        if (!row._formatting.cells) {
          row._formatting.cells = {};
        }
        row._formatting.cells[field] = {
          ...row._formatting.cells[field],
          ...formatting
        };
        break;

      case 'row':
        row._formatting.row = {
          ...row._formatting.row,
          ...formatting
        };
        break;

      case 'column':
        if (!row._formatting.columns) {
          row._formatting.columns = {};
        }
        row._formatting.columns[field] = {
          ...row._formatting.columns[field],
          ...formatting
        };
        break;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Interpolate color from gradient
   */
  interpolateColor(colors, position) {
    if (position <= 0) return colors[0];
    if (position >= 1) return colors[colors.length - 1];

    const segmentCount = colors.length - 1;
    const segmentIndex = Math.floor(position * segmentCount);
    const segmentPosition = (position * segmentCount) - segmentIndex;

    const color1 = colors[segmentIndex];
    const color2 = colors[segmentIndex + 1];

    return this.blendColors(color1, color2, segmentPosition);
  }

  /**
   * Blend two hex colors
   */
  blendColors(color1, color2, ratio) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Evaluate formula in context of row
   */
  evaluateFormula(formula, row) {
    try {
      // Simple formula evaluation - replace field references with values
      let expression = formula;

      // Replace field references like {fieldName} with actual values
      expression = expression.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, field) => {
        const value = this.getNestedValue(row, field);
        return typeof value === 'string' ? `"${value}"` : value;
      });

      // Use Function constructor for safe evaluation (limited scope)
      const func = new Function('return ' + expression);
      return func();
    } catch (error) {
      logger.error('Formula evaluation failed', {
        formula,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Create a formatting rule
   */
  createRule(ruleConfig) {
    const {
      name,
      type,
      field,
      condition,
      formatting,
      scope = 'cell',
      priority = 0,
      enabled = true
    } = ruleConfig;

    if (!Object.values(this.ruleTypes).includes(type)) {
      throw new Error(`Invalid rule type: ${type}`);
    }

    return {
      id: this.generateRuleId(),
      name,
      type,
      field,
      condition,
      formatting,
      scope,
      priority,
      enabled,
      createdAt: new Date()
    };
  }

  /**
   * Generate unique rule ID
   */
  generateRuleId() {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get available formatting options
   */
  getFormattingOptions() {
    return {
      ruleTypes: this.ruleTypes,
      operators: this.operators,
      iconSets: Object.keys(this.iconSets),
      colorScales: Object.keys(this.colorScales),
      scopes: ['cell', 'row', 'column']
    };
  }
}

module.exports = new ReportFormattingService();
