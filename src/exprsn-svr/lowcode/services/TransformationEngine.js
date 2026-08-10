/**
 * Transformation Engine
 *
 * Power Query M-like transformation engine for data manipulation.
 * Supports visual transformation steps similar to Excel Power Query.
 */

const logger = require('../utils/logger');

class TransformationEngine {
  /**
   * Apply transformation pipeline to data
   *
   * @param {Array} data - Array of row objects
   * @param {Array} transformations - Array of transformation steps
   * @returns {Object} - Transformed data and statistics
   */
  async applyTransformations(data, transformations) {
    let currentData = [...data];
    const log = [];
    let errors = [];

    for (const [index, step] of transformations.entries()) {
      try {
        const beforeCount = currentData.length;

        currentData = await this.applyStep(currentData, step);

        const afterCount = currentData.length;

        log.push({
          stepIndex: index,
          stepType: step.type,
          rowsBefore: beforeCount,
          rowsAfter: afterCount,
          rowsAffected: Math.abs(afterCount - beforeCount),
          success: true
        });
      } catch (error) {
        logger.error('Transformation step failed', {
          stepIndex: index,
          stepType: step.type,
          error: error.message
        });

        errors.push({
          stepIndex: index,
          stepType: step.type,
          error: error.message
        });

        // Continue with next step or stop based on configuration
        if (step.stopOnError) {
          break;
        }
      }
    }

    return {
      data: currentData,
      transformationLog: log,
      errors,
      stats: {
        totalRows: currentData.length,
        errorCount: errors.length
      }
    };
  }

  /**
   * Apply single transformation step
   */
  async applyStep(data, step) {
    switch (step.type) {
      // Column Operations
      case 'renameColumn':
        return this.renameColumn(data, step);
      case 'removeColumn':
        return this.removeColumn(data, step);
      case 'duplicateColumn':
        return this.duplicateColumn(data, step);
      case 'reorderColumns':
        return this.reorderColumns(data, step);
      case 'splitColumn':
        return this.splitColumn(data, step);
      case 'mergeColumns':
        return this.mergeColumns(data, step);

      // Type Conversions
      case 'changeType':
        return this.changeType(data, step);
      case 'convertToNumber':
        return this.convertToNumber(data, step);
      case 'convertToDate':
        return this.convertToDate(data, step);
      case 'convertToBoolean':
        return this.convertToBoolean(data, step);

      // Data Cleaning
      case 'removeErrors':
        return this.removeErrors(data, step);
      case 'removeDuplicates':
        return this.removeDuplicates(data, step);
      case 'removeNulls':
        return this.removeNulls(data, step);
      case 'replaceValue':
        return this.replaceValue(data, step);
      case 'trim':
        return this.trim(data, step);
      case 'clean':
        return this.clean(data, step);

      // Row Operations
      case 'filterRows':
        return this.filterRows(data, step);
      case 'sortRows':
        return this.sortRows(data, step);
      case 'keepTopRows':
        return this.keepTopRows(data, step);
      case 'removeTopRows':
        return this.removeTopRows(data, step);

      // Calculated Columns
      case 'addColumn':
        return this.addColumn(data, step);
      case 'customColumn':
        return this.customColumn(data, step);
      case 'conditionalColumn':
        return this.conditionalColumn(data, step);

      // Aggregations
      case 'groupBy':
        return this.groupBy(data, step);
      case 'pivot':
        return this.pivot(data, step);
      case 'unpivot':
        return this.unpivot(data, step);

      // Advanced
      case 'fillDown':
        return this.fillDown(data, step);
      case 'fillUp':
        return this.fillUp(data, step);
      case 'extractText':
        return this.extractText(data, step);

      default:
        throw new Error(`Unknown transformation type: ${step.type}`);
    }
  }

  // ============================================================================
  // COLUMN OPERATIONS
  // ============================================================================

  renameColumn(data, step) {
    const { oldName, newName } = step.params;
    return data.map(row => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
  }

  removeColumn(data, step) {
    const { columnName } = step.params;
    return data.map(row => {
      const newRow = { ...row };
      delete newRow[columnName];
      return newRow;
    });
  }

  duplicateColumn(data, step) {
    const { columnName, newColumnName } = step.params;
    return data.map(row => ({
      ...row,
      [newColumnName]: row[columnName]
    }));
  }

  reorderColumns(data, step) {
    const { columnOrder } = step.params; // Array of column names in desired order
    return data.map(row => {
      const newRow = {};
      columnOrder.forEach(col => {
        if (col in row) {
          newRow[col] = row[col];
        }
      });
      // Add any remaining columns not in the order
      Object.keys(row).forEach(col => {
        if (!columnOrder.includes(col)) {
          newRow[col] = row[col];
        }
      });
      return newRow;
    });
  }

  splitColumn(data, step) {
    const { columnName, delimiter, newColumnNames } = step.params;
    return data.map(row => {
      const value = row[columnName];
      const parts = typeof value === 'string' ? value.split(delimiter) : [];
      const newRow = { ...row };

      newColumnNames.forEach((name, index) => {
        newRow[name] = parts[index] || null;
      });

      delete newRow[columnName];
      return newRow;
    });
  }

  mergeColumns(data, step) {
    const { columnNames, separator, newColumnName } = step.params;
    return data.map(row => {
      const values = columnNames.map(col => row[col] || '');
      const newRow = { ...row };
      newRow[newColumnName] = values.join(separator);

      // Optionally remove original columns
      if (step.params.removeOriginal) {
        columnNames.forEach(col => delete newRow[col]);
      }

      return newRow;
    });
  }

  // ============================================================================
  // TYPE CONVERSIONS
  // ============================================================================

  changeType(data, step) {
    const { columnName, targetType, errorStrategy = 'keep' } = step.params;

    return data.map(row => {
      try {
        const value = row[columnName];
        let converted;

        switch (targetType) {
          case 'number':
            converted = this.toNumber(value);
            break;
          case 'string':
            converted = String(value);
            break;
          case 'boolean':
            converted = this.toBoolean(value);
            break;
          case 'date':
            converted = this.toDate(value);
            break;
          default:
            converted = value;
        }

        return { ...row, [columnName]: converted };
      } catch (error) {
        if (errorStrategy === 'null') {
          return { ...row, [columnName]: null };
        } else if (errorStrategy === 'error') {
          return { ...row, [columnName]: `[Error: ${error.message}]` };
        }
        return row; // keep original
      }
    });
  }

  toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (isNaN(num)) throw new Error('Not a valid number');
    return num;
  }

  toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(lower)) return true;
      if (['false', 'no', '0', 'n'].includes(lower)) return false;
    }
    return Boolean(value);
  }

  toDate(value) {
    if (value instanceof Date) return value;
    const date = new Date(value);
    if (isNaN(date.getTime())) throw new Error('Not a valid date');
    return date;
  }

  // ============================================================================
  // DATA CLEANING
  // ============================================================================

  removeErrors(data, step) {
    const { columnName } = step.params;
    return data.filter(row => {
      const value = row[columnName];
      return !(typeof value === 'string' && value.startsWith('[Error:'));
    });
  }

  removeDuplicates(data, step) {
    const { columnNames } = step.params || {};
    const seen = new Set();

    return data.filter(row => {
      const key = columnNames
        ? columnNames.map(col => row[col]).join('|')
        : JSON.stringify(row);

      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  removeNulls(data, step) {
    const { columnName } = step.params;
    return data.filter(row => {
      const value = row[columnName];
      return value !== null && value !== undefined && value !== '';
    });
  }

  replaceValue(data, step) {
    const { columnName, oldValue, newValue } = step.params;
    return data.map(row => ({
      ...row,
      [columnName]: row[columnName] === oldValue ? newValue : row[columnName]
    }));
  }

  trim(data, step) {
    const { columnName } = step.params;
    return data.map(row => ({
      ...row,
      [columnName]: typeof row[columnName] === 'string'
        ? row[columnName].trim()
        : row[columnName]
    }));
  }

  clean(data, step) {
    const { columnName } = step.params;
    return data.map(row => {
      let value = row[columnName];
      if (typeof value === 'string') {
        // Remove non-printable characters
        value = value.replace(/[^\x20-\x7E]/g, '');
      }
      return { ...row, [columnName]: value };
    });
  }

  // ============================================================================
  // ROW OPERATIONS
  // ============================================================================

  filterRows(data, step) {
    const { columnName, operator, value } = step.params;

    return data.filter(row => {
      const rowValue = row[columnName];

      switch (operator) {
        case 'equals':
          return rowValue == value;
        case 'notEquals':
          return rowValue != value;
        case 'contains':
          return String(rowValue).includes(String(value));
        case 'startsWith':
          return String(rowValue).startsWith(String(value));
        case 'endsWith':
          return String(rowValue).endsWith(String(value));
        case 'greaterThan':
          return rowValue > value;
        case 'lessThan':
          return rowValue < value;
        case 'isEmpty':
          return !rowValue;
        case 'isNotEmpty':
          return !!rowValue;
        default:
          return true;
      }
    });
  }

  sortRows(data, step) {
    const { columnName, order = 'asc' } = step.params;

    return [...data].sort((a, b) => {
      const aVal = a[columnName];
      const bVal = b[columnName];

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  keepTopRows(data, step) {
    const { count } = step.params;
    return data.slice(0, count);
  }

  removeTopRows(data, step) {
    const { count } = step.params;
    return data.slice(count);
  }

  // ============================================================================
  // CALCULATED COLUMNS
  // ============================================================================

  addColumn(data, step) {
    const { columnName, value } = step.params;
    return data.map(row => ({
      ...row,
      [columnName]: value
    }));
  }

  customColumn(data, step) {
    const { columnName, formula } = step.params;
    // Simple formula evaluation (could be enhanced with JSONLex)
    return data.map(row => ({
      ...row,
      [columnName]: this.evaluateFormula(formula, row)
    }));
  }

  conditionalColumn(data, step) {
    const { columnName, conditions, defaultValue } = step.params;

    return data.map(row => {
      for (const condition of conditions) {
        if (this.evaluateCondition(condition, row)) {
          return { ...row, [columnName]: condition.value };
        }
      }
      return { ...row, [columnName]: defaultValue };
    });
  }

  evaluateFormula(formula, row) {
    // Simple formula evaluation
    // Replace column references like [ColumnName] with values
    let result = formula;
    Object.keys(row).forEach(key => {
      result = result.replace(new RegExp(`\\[${key}\\]`, 'g'), row[key]);
    });

    try {
      // Safe evaluation (in production, use a proper expression evaluator)
      return Function(`'use strict'; return (${result})`)();
    } catch (error) {
      return `[Error: ${error.message}]`;
    }
  }

  evaluateCondition(condition, row) {
    const { columnName, operator, value } = condition;
    const rowValue = row[columnName];

    switch (operator) {
      case 'equals': return rowValue == value;
      case 'notEquals': return rowValue != value;
      case 'greaterThan': return rowValue > value;
      case 'lessThan': return rowValue < value;
      default: return false;
    }
  }

  // ============================================================================
  // AGGREGATIONS
  // ============================================================================

  groupBy(data, step) {
    const { groupColumns, aggregations } = step.params;
    const groups = {};

    // Group rows
    data.forEach(row => {
      const key = groupColumns.map(col => row[col]).join('|');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    // Aggregate each group
    return Object.entries(groups).map(([key, rows]) => {
      const result = {};

      // Add group columns
      groupColumns.forEach((col, index) => {
        result[col] = key.split('|')[index];
      });

      // Add aggregations
      aggregations.forEach(agg => {
        result[agg.newColumnName] = this.aggregate(rows, agg);
      });

      return result;
    });
  }

  aggregate(rows, agg) {
    const values = rows.map(row => row[agg.columnName]).filter(v => v != null);

    switch (agg.operation) {
      case 'count':
        return rows.length;
      case 'sum':
        return values.reduce((sum, val) => sum + Number(val), 0);
      case 'average':
        return values.reduce((sum, val) => sum + Number(val), 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'first':
        return values[0];
      case 'last':
        return values[values.length - 1];
      default:
        return null;
    }
  }

  fillDown(data, step) {
    const { columnName } = step.params;
    let lastValue = null;

    return data.map(row => {
      if (row[columnName] !== null && row[columnName] !== undefined && row[columnName] !== '') {
        lastValue = row[columnName];
      } else if (lastValue !== null) {
        return { ...row, [columnName]: lastValue };
      }
      return row;
    });
  }

  fillUp(data, step) {
    const { columnName } = step.params;
    let nextValue = null;

    // Process in reverse
    const result = [...data].reverse().map(row => {
      if (row[columnName] !== null && row[columnName] !== undefined && row[columnName] !== '') {
        nextValue = row[columnName];
      } else if (nextValue !== null) {
        return { ...row, [columnName]: nextValue };
      }
      return row;
    });

    return result.reverse();
  }

  pivot(data, step) {
    // Complex pivot operation - simplified version
    const { rowColumn, columnColumn, valueColumn } = step.params;
    // Implementation would be similar to Excel pivot tables
    throw new Error('Pivot operation not yet implemented');
  }

  unpivot(data, step) {
    // Unpivot columns into rows
    const { columnsToUnpivot, attributeColumnName, valueColumnName } = step.params;
    const result = [];

    data.forEach(row => {
      columnsToUnpivot.forEach(col => {
        const newRow = { ...row };
        delete newRow[col];
        newRow[attributeColumnName] = col;
        newRow[valueColumnName] = row[col];
        result.push(newRow);
      });
    });

    return result;
  }

  extractText(data, step) {
    const { columnName, pattern, newColumnName } = step.params;
    const regex = new RegExp(pattern);

    return data.map(row => {
      const value = row[columnName];
      const match = typeof value === 'string' ? value.match(regex) : null;
      return {
        ...row,
        [newColumnName]: match ? match[1] || match[0] : null
      };
    });
  }
}

module.exports = new TransformationEngine();
