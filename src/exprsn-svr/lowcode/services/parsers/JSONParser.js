/**
 * JSON Parser Service
 *
 * Parses JSON files and API endpoints. Supports nested objects and arrays.
 */

const fs = require('fs');
const axios = require('axios');
const logger = require('../../utils/logger');

class JSONParser {
  /**
   * Parse JSON from file, buffer, URL, or API endpoint
   *
   * @param {string|Buffer|Object} input - File path, buffer, URL, or object
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} - Parsed rows (flattened if necessary)
   */
  async parse(input, options = {}) {
    const {
      flatten = true,          // Flatten nested objects
      arrayPath = null,        // JSONPath to array data (e.g., "data.items")
      maxDepth = 5,            // Max nesting depth for flattening
      headers = {},            // HTTP headers for API requests
      method = 'GET',          // HTTP method
      body = null              // Request body for POST/PUT
    } = options;

    try {
      let data;

      // Determine input type and parse
      if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
        // URL - fetch from API
        data = await this.fetchFromAPI(input, { method, headers, body });
      } else if (Buffer.isBuffer(input)) {
        // Buffer
        data = JSON.parse(input.toString('utf-8'));
      } else if (typeof input === 'string') {
        // File path
        const content = fs.readFileSync(input, 'utf-8');
        data = JSON.parse(content);
      } else if (typeof input === 'object') {
        // Already an object
        data = input;
      } else {
        throw new Error('Invalid input type for JSON parser');
      }

      // Extract array from nested path if specified
      if (arrayPath) {
        data = this.extractArrayPath(data, arrayPath);
      }

      // Ensure data is an array
      if (!Array.isArray(data)) {
        data = [data];
      }

      // Flatten nested objects if requested
      if (flatten) {
        data = data.map(item => this.flattenObject(item, '', maxDepth));
      }

      logger.info('JSON parsing completed', { rowCount: data.length });

      return data;
    } catch (error) {
      logger.error('JSON parsing failed', { error: error.message });
      throw new Error(`JSON parsing failed: ${error.message}`);
    }
  }

  /**
   * Fetch JSON from API endpoint
   */
  async fetchFromAPI(url, options = {}) {
    try {
      const response = await axios({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: options.body,
        timeout: 30000,
        maxContentLength: 100 * 1024 * 1024 // 100MB max
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API request failed: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('API request failed: No response received');
      } else {
        throw new Error(`API request failed: ${error.message}`);
      }
    }
  }

  /**
   * Extract array from nested JSON path
   * Example: "data.items" extracts items array from { data: { items: [...] } }
   */
  extractArrayPath(data, path) {
    const parts = path.split('.');
    let current = data;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        throw new Error(`Path "${path}" not found in JSON data`);
      }
    }

    return current;
  }

  /**
   * Flatten nested object to single level
   * { user: { name: "John" } } => { "user.name": "John" }
   */
  flattenObject(obj, prefix = '', maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return { [prefix.slice(0, -1)]: obj };
    }

    const flattened = {};

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const value = obj[key];
      const newKey = prefix + key;

      if (value === null || value === undefined) {
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Convert arrays to JSON strings
        flattened[newKey] = JSON.stringify(value);
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, this.flattenObject(value, newKey + '.', maxDepth, currentDepth + 1));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  /**
   * Unflatten object back to nested structure
   * { "user.name": "John" } => { user: { name: "John" } }
   */
  unflattenObject(obj) {
    const result = {};

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const parts = key.split('.');
      let current = result;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }

      current[parts[parts.length - 1]] = obj[key];
    }

    return result;
  }

  /**
   * Preview JSON (first 100 items)
   */
  async preview(input, options = {}) {
    const data = await this.parse(input, options);
    return data.slice(0, 100);
  }

  /**
   * Get JSON metadata
   */
  async getMetadata(input, options = {}) {
    const preview = await this.preview(input, options);

    return {
      format: 'json',
      estimatedRows: preview.length, // Can't estimate without parsing all
      columnCount: preview.length > 0 ? Object.keys(preview[0]).length : 0,
      columns: preview.length > 0 ? Object.keys(preview[0]) : [],
      preview: preview.slice(0, 10),
      isNested: this.detectNesting(preview)
    };
  }

  /**
   * Detect if data has nested structures
   */
  detectNesting(data) {
    if (data.length === 0) return false;

    const sample = data[0];
    for (const key in sample) {
      const value = sample[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate JSON structure
   */
  validate(input) {
    try {
      if (typeof input === 'string') {
        JSON.parse(input);
      }
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        position: error.message.match(/position (\d+)/)?.[1]
      };
    }
  }
}

module.exports = new JSONParser();
