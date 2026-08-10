/**
 * Schema Inference Service
 *
 * Automatically detects column types, patterns, and data quality issues.
 * Similar to Power Query's automatic type detection.
 */

class SchemaInferenceService {
  /**
   * Infer schema from sample data
   *
   * @param {Array} data - Array of row objects
   * @param {Object} options - Inference options
   * @returns {Object} - Inferred schema with column definitions
   */
  inferSchema(data, options = {}) {
    if (!data || data.length === 0) {
      return {
        columns: [],
        rowCount: 0,
        dataQuality: {}
      };
    }

    const sampleSize = Math.min(options.sampleSize || 1000, data.length);
    const sample = data.slice(0, sampleSize);

    // Get all unique column names
    const columnNames = this.extractColumnNames(sample);

    // Infer type and stats for each column
    const columns = columnNames.map(name => this.inferColumn(name, sample));

    // Calculate data quality metrics
    const dataQuality = this.calculateDataQuality(sample, columns);

    return {
      columns,
      rowCount: data.length,
      dataQuality,
      sampleSize
    };
  }

  /**
   * Extract all unique column names from data
   */
  extractColumnNames(data) {
    const columnSet = new Set();

    data.forEach(row => {
      Object.keys(row).forEach(key => columnSet.add(key));
    });

    return Array.from(columnSet);
  }

  /**
   * Infer type and statistics for a single column
   */
  inferColumn(columnName, data) {
    const values = data.map(row => row[columnName]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

    // Sample values for analysis
    const uniqueValues = [...new Set(nonNullValues)];
    const sampleValues = uniqueValues.slice(0, 100);

    return {
      name: columnName,
      displayName: this.toDisplayName(columnName),
      type: this.inferType(nonNullValues),
      nullable: values.length !== nonNullValues.length,
      nullCount: values.length - nonNullValues.length,
      uniqueCount: uniqueValues.length,
      sampleValues: sampleValues.slice(0, 10),
      min: this.calculateMin(nonNullValues),
      max: this.calculateMax(nonNullValues),
      avgLength: this.calculateAvgLength(nonNullValues),
      pattern: this.detectPattern(nonNullValues),
      suggestedType: this.suggestOptimalType(nonNullValues),
      dataQuality: {
        completeness: (nonNullValues.length / values.length) * 100,
        uniqueness: (uniqueValues.length / nonNullValues.length) * 100 || 0,
        hasErrors: false,
        errorCount: 0
      }
    };
  }

  /**
   * Infer data type from values
   */
  inferType(values) {
    if (values.length === 0) return 'string';

    // Check if all values are of the same type
    const types = values.map(v => this.getValueType(v));
    const typeCounts = {};

    types.forEach(type => {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Get most common type
    const sortedTypes = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a);

    const dominantType = sortedTypes[0][0];
    const dominantCount = sortedTypes[0][1];

    // If 80%+ are the same type, use that type
    if (dominantCount / values.length >= 0.8) {
      return dominantType;
    }

    // Mixed types - default to string
    return 'string';
  }

  /**
   * Get type of a single value
   */
  getValueType(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';

    if (typeof value === 'string') {
      // Try to detect specific string types
      if (this.isEmail(value)) return 'email';
      if (this.isUrl(value)) return 'url';
      if (this.isDate(value)) return 'date';
      if (this.isNumber(value)) return 'number';
      if (this.isBoolean(value)) return 'boolean';
    }

    return 'string';
  }

  /**
   * Suggest optimal type for column
   */
  suggestOptimalType(values) {
    const inferredType = this.inferType(values);

    // Additional suggestions based on patterns
    if (inferredType === 'string') {
      const sampleValues = values.slice(0, 100);

      if (sampleValues.every(v => this.isEmail(v))) return 'email';
      if (sampleValues.every(v => this.isUrl(v))) return 'url';
      if (sampleValues.every(v => this.isPhoneNumber(v))) return 'phone';
      if (sampleValues.every(v => this.isPostalCode(v))) return 'postal_code';
    }

    return inferredType;
  }

  /**
   * Detect common patterns in data
   */
  detectPattern(values) {
    if (values.length === 0) return null;

    const sample = values.slice(0, 100);

    // Check for common patterns
    if (sample.every(v => /^\d{3}-\d{2}-\d{4}$/.test(v))) {
      return { type: 'ssn', pattern: '###-##-####' };
    }

    if (sample.every(v => /^\d{5}(-\d{4})?$/.test(v))) {
      return { type: 'zip_code', pattern: '##### or #####-####' };
    }

    if (sample.every(v => /^\(\d{3}\) \d{3}-\d{4}$/.test(v))) {
      return { type: 'phone', pattern: '(###) ###-####' };
    }

    return null;
  }

  /**
   * Type validators
   */
  isEmail(value) {
    if (typeof value !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  isUrl(value) {
    if (typeof value !== 'string') return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  isDate(value) {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  isNumber(value) {
    if (typeof value !== 'string') return false;
    return !isNaN(Number(value)) && value.trim() !== '';
  }

  isBoolean(value) {
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    return ['true', 'false', 'yes', 'no', '1', '0'].includes(lower);
  }

  isPhoneNumber(value) {
    if (typeof value !== 'string') return false;
    return /^[\d\s\-\(\)]+$/.test(value) && value.replace(/\D/g, '').length >= 10;
  }

  isPostalCode(value) {
    if (typeof value !== 'string') return false;
    return /^\d{5}(-\d{4})?$/.test(value);
  }

  /**
   * Calculate statistics
   */
  calculateMin(values) {
    const numbers = values.filter(v => typeof v === 'number');
    return numbers.length > 0 ? Math.min(...numbers) : null;
  }

  calculateMax(values) {
    const numbers = values.filter(v => typeof v === 'number');
    return numbers.length > 0 ? Math.max(...numbers) : null;
  }

  calculateAvgLength(values) {
    const strings = values.filter(v => typeof v === 'string');
    if (strings.length === 0) return null;

    const totalLength = strings.reduce((sum, str) => sum + str.length, 0);
    return Math.round(totalLength / strings.length);
  }

  /**
   * Calculate overall data quality metrics
   */
  calculateDataQuality(data, columns) {
    const totalCells = data.length * columns.length;
    const emptyCells = columns.reduce((sum, col) => sum + col.nullCount, 0);

    return {
      completeness: ((totalCells - emptyCells) / totalCells) * 100,
      totalRows: data.length,
      totalColumns: columns.length,
      emptyValues: emptyCells,
      issues: this.detectDataQualityIssues(data, columns)
    };
  }

  /**
   * Detect data quality issues
   */
  detectDataQualityIssues(data, columns) {
    const issues = [];

    columns.forEach(col => {
      // High null rate
      if (col.dataQuality.completeness < 50) {
        issues.push({
          severity: 'warning',
          column: col.name,
          issue: 'high_null_rate',
          message: `Column "${col.name}" has ${col.nullCount} null values (${(100 - col.dataQuality.completeness).toFixed(1)}%)`
        });
      }

      // Low cardinality (might be categorical)
      if (col.uniqueCount < 10 && data.length > 100) {
        issues.push({
          severity: 'info',
          column: col.name,
          issue: 'low_cardinality',
          message: `Column "${col.name}" has only ${col.uniqueCount} unique values - consider as categorical`
        });
      }

      // All values identical
      if (col.uniqueCount === 1 && col.dataQuality.completeness > 50) {
        issues.push({
          severity: 'warning',
          column: col.name,
          issue: 'constant_value',
          message: `Column "${col.name}" has the same value in all rows - consider removing`
        });
      }
    });

    return issues;
  }

  /**
   * Convert technical name to display name
   */
  toDisplayName(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

module.exports = new SchemaInferenceService();
