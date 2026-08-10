/**
 * File Connection Handler
 *
 * Handles connections to file-based data sources including JSON, XML, CSV, and TSV.
 * Supports both local files and remote URLs.
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { parse: parseCSV } = require('csv-parse/sync');
const xml2js = require('xml2js');
const BaseConnectionHandler = require('./BaseConnectionHandler');

class FileConnectionHandler extends BaseConnectionHandler {
  constructor(config) {
    super(config);
    this.validateConfig(['source', 'type']);
    this.data = null;
    this.lastModified = null;
  }

  /**
   * Connect to file source
   */
  async connect() {
    try {
      // Load and parse the file
      await this.loadFile();
    } catch (error) {
      this.handleError(error, { action: 'connect' });
    }
  }

  /**
   * Disconnect from file source
   */
  async disconnect() {
    this.data = null;
    this.lastModified = null;
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      await this.loadFile();

      return {
        success: true,
        type: this.config.type,
        source: this.config.source,
        recordCount: Array.isArray(this.data) ? this.data.length : 1,
        lastModified: this.lastModified
      };
    } catch (error) {
      this.handleError(error, { action: 'testConnection' });
    }
  }

  /**
   * Load file from source
   */
  async loadFile() {
    let content;

    // Determine if source is URL or file path
    if (this.config.source.startsWith('http://') || this.config.source.startsWith('https://')) {
      content = await this.loadFromURL();
    } else {
      content = await this.loadFromFile();
    }

    // Parse content based on type
    this.data = await this.parseContent(content);
    this.lastModified = new Date();

    return this.data;
  }

  /**
   * Load from local file
   */
  async loadFromFile() {
    try {
      const filePath = path.resolve(this.config.source);
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      throw new Error(`Failed to load file: ${error.message}`);
    }
  }

  /**
   * Load from URL
   */
  async loadFromURL() {
    try {
      const response = await axios.get(this.config.source, {
        timeout: this.config.timeout || 30000,
        responseType: 'text'
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to load from URL: ${error.message}`);
    }
  }

  /**
   * Parse content based on file type
   */
  async parseContent(content) {
    switch (this.config.type.toLowerCase()) {
      case 'json':
        return this.parseJSON(content);

      case 'xml':
        return this.parseXML(content);

      case 'csv':
        return this.parseCSV(content);

      case 'tsv':
        return this.parseTSV(content);

      default:
        throw new Error(`Unsupported file type: ${this.config.type}`);
    }
  }

  /**
   * Parse JSON
   */
  parseJSON(content) {
    try {
      const data = JSON.parse(content);

      // Apply JSON path if specified
      if (this.config.jsonPath) {
        const jp = require('jsonpath-plus');
        return jp.JSONPath({ path: this.config.jsonPath, json: data });
      }

      return data;
    } catch (error) {
      throw new Error(`JSON parse error: ${error.message}`);
    }
  }

  /**
   * Parse XML
   */
  async parseXML(content) {
    try {
      const parser = new xml2js.Parser({
        explicitArray: this.config.xmlExplicitArray !== false,
        mergeAttrs: this.config.xmlMergeAttrs || false,
        ...this.config.xmlOptions
      });

      const result = await parser.parseStringPromise(content);

      // Apply XPath if specified
      if (this.config.xpath) {
        // Simple XPath support (for complex needs, use xpath library)
        return this.extractByPath(result, this.config.xpath);
      }

      return result;
    } catch (error) {
      throw new Error(`XML parse error: ${error.message}`);
    }
  }

  /**
   * Parse CSV
   */
  parseCSV(content) {
    try {
      const records = parseCSV(content, {
        columns: this.config.csvHeaders !== false,
        skip_empty_lines: true,
        delimiter: this.config.csvDelimiter || ',',
        quote: this.config.csvQuote || '"',
        trim: this.config.csvTrim !== false,
        ...this.config.csvOptions
      });

      return records;
    } catch (error) {
      throw new Error(`CSV parse error: ${error.message}`);
    }
  }

  /**
   * Parse TSV
   */
  parseTSV(content) {
    try {
      const records = parseCSV(content, {
        columns: this.config.csvHeaders !== false,
        skip_empty_lines: true,
        delimiter: '\t',
        quote: this.config.csvQuote || '"',
        trim: this.config.csvTrim !== false,
        ...this.config.csvOptions
      });

      return records;
    } catch (error) {
      throw new Error(`TSV parse error: ${error.message}`);
    }
  }

  /**
   * Execute query
   */
  async query(queryConfig) {
    const {
      operation = 'read',
      filters = {},
      sortBy = null,
      limit = null,
      offset = 0,
      reload = false
    } = queryConfig;

    // Reload file if requested or not loaded
    if (reload || !this.data) {
      await this.loadFile();
    }

    // Apply operation
    switch (operation) {
      case 'read':
        return this.read(filters, sortBy, limit, offset);

      case 'count':
        return this.count(filters);

      case 'find':
        return this.find(filters);

      case 'findOne':
        return this.findOne(filters);

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Read data with filters and pagination
   */
  read(filters = {}, sortBy = null, limit = null, offset = 0) {
    let results = Array.isArray(this.data) ? [...this.data] : [this.data];

    // Apply filters
    if (Object.keys(filters).length > 0) {
      results = results.filter(record => this.matchesFilters(record, filters));
    }

    // Apply sorting
    if (sortBy) {
      results = this.sortData(results, sortBy);
    }

    // Apply pagination
    const total = results.length;
    if (limit) {
      results = results.slice(offset, offset + limit);
    } else if (offset > 0) {
      results = results.slice(offset);
    }

    return {
      data: results,
      total,
      limit,
      offset,
      hasMore: limit ? offset + limit < total : false
    };
  }

  /**
   * Count records matching filters
   */
  count(filters = {}) {
    let results = Array.isArray(this.data) ? this.data : [this.data];

    if (Object.keys(filters).length > 0) {
      results = results.filter(record => this.matchesFilters(record, filters));
    }

    return {
      count: results.length
    };
  }

  /**
   * Find all records matching filters
   */
  find(filters = {}) {
    const results = Array.isArray(this.data) ? this.data : [this.data];

    if (Object.keys(filters).length === 0) {
      return results;
    }

    return results.filter(record => this.matchesFilters(record, filters));
  }

  /**
   * Find first record matching filters
   */
  findOne(filters = {}) {
    const results = this.find(filters);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Check if record matches filters
   */
  matchesFilters(record, filters) {
    for (const key in filters) {
      const filterValue = filters[key];
      const recordValue = this.getNestedValue(record, key);

      // Support different filter operators
      if (typeof filterValue === 'object' && filterValue !== null) {
        // Operator-based filtering
        if (filterValue.$eq !== undefined && recordValue !== filterValue.$eq) return false;
        if (filterValue.$ne !== undefined && recordValue === filterValue.$ne) return false;
        if (filterValue.$gt !== undefined && recordValue <= filterValue.$gt) return false;
        if (filterValue.$gte !== undefined && recordValue < filterValue.$gte) return false;
        if (filterValue.$lt !== undefined && recordValue >= filterValue.$lt) return false;
        if (filterValue.$lte !== undefined && recordValue > filterValue.$lte) return false;
        if (filterValue.$in !== undefined && !filterValue.$in.includes(recordValue)) return false;
        if (filterValue.$nin !== undefined && filterValue.$nin.includes(recordValue)) return false;
        if (filterValue.$regex !== undefined && !new RegExp(filterValue.$regex).test(recordValue)) return false;
      } else {
        // Direct value comparison
        if (recordValue !== filterValue) return false;
      }
    }

    return true;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }

  /**
   * Sort data
   */
  sortData(data, sortBy) {
    const [field, order = 'asc'] = Array.isArray(sortBy) ? sortBy : [sortBy, 'asc'];

    return data.sort((a, b) => {
      const aVal = this.getNestedValue(a, field);
      const bVal = this.getNestedValue(b, field);

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Extract data by path (simple XPath-like)
   */
  extractByPath(obj, path) {
    const parts = path.split('/').filter(p => p);
    let current = obj;

    for (const part of parts) {
      if (Array.isArray(current)) {
        current = current.map(item => item[part]).flat();
      } else {
        current = current[part];
      }

      if (current === undefined) {
        return null;
      }
    }

    return current;
  }

  /**
   * Reload file
   */
  async reload() {
    await this.loadFile();
    return {
      success: true,
      lastModified: this.lastModified,
      recordCount: Array.isArray(this.data) ? this.data.length : 1
    };
  }

  /**
   * Get raw data
   */
  getRawData() {
    return this.data;
  }
}

module.exports = FileConnectionHandler;
