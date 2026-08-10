/**
 * XML Parser Service
 *
 * Parses XML files and API endpoints into tabular format.
 */

const fs = require('fs');
const axios = require('axios');
const { XMLParser: FastXMLParser } = require('fast-xml-parser');
const logger = require('../../utils/logger');

class XMLParser {
  constructor() {
    this.defaultOptions = {
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
      ignoreDeclaration: true,
      ignorePiTags: true
    };
  }

  /**
   * Parse XML from file, buffer, or URL
   *
   * @param {string|Buffer} input - File path, buffer, or URL
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} - Parsed rows
   */
  async parse(input, options = {}) {
    const {
      arrayPath = null,        // Path to repeating elements (e.g., "root.items.item")
      flatten = true,          // Flatten nested elements
      maxDepth = 5,            // Max nesting depth
      headers = {},            // HTTP headers for API requests
      parserOptions = {}       // fast-xml-parser options
    } = options;

    try {
      let xmlString;

      // Get XML content
      if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
        // URL - fetch from API
        xmlString = await this.fetchFromAPI(input, headers);
      } else if (Buffer.isBuffer(input)) {
        // Buffer
        xmlString = input.toString('utf-8');
      } else if (typeof input === 'string') {
        // File path
        xmlString = fs.readFileSync(input, 'utf-8');
      } else {
        throw new Error('Invalid input type for XML parser');
      }

      // Parse XML to JSON
      const parser = new FastXMLParser({
        ...this.defaultOptions,
        ...parserOptions
      });

      const parsed = parser.parse(xmlString);

      // Extract array from path if specified
      let data = arrayPath ? this.extractPath(parsed, arrayPath) : parsed;

      // Ensure data is an array
      if (!Array.isArray(data)) {
        // If it's an object with repeating child elements, extract them
        data = this.findArrays(data);

        if (!Array.isArray(data)) {
          data = [data];
        }
      }

      // Flatten if requested
      if (flatten) {
        data = data.map(item => this.flattenObject(item, '', maxDepth));
      }

      logger.info('XML parsing completed', { rowCount: data.length });

      return data;
    } catch (error) {
      logger.error('XML parsing failed', { error: error.message });
      throw new Error(`XML parsing failed: ${error.message}`);
    }
  }

  /**
   * Fetch XML from API endpoint
   */
  async fetchFromAPI(url, headers = {}) {
    try {
      const response = await axios({
        method: 'GET',
        url,
        headers: {
          'Accept': 'application/xml, text/xml',
          ...headers
        },
        timeout: 30000,
        responseType: 'text'
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
   * Extract data from nested XML path
   */
  extractPath(data, path) {
    const parts = path.split('.');
    let current = data;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        throw new Error(`Path "${path}" not found in XML data`);
      }
    }

    return current;
  }

  /**
   * Find arrays in parsed XML (repeating elements)
   */
  findArrays(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    // Look for arrays in the object
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        return obj[key];
      }
    }

    // If no arrays found, look one level deeper
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = this.findArrays(obj[key]);
        if (Array.isArray(result)) {
          return result;
        }
      }
    }

    return obj;
  }

  /**
   * Flatten nested object to single level
   */
  flattenObject(obj, prefix = '', maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return { [prefix.slice(0, -1)]: obj };
    }

    const flattened = {};

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      // Skip XML metadata fields
      if (key === '#text' && Object.keys(obj).length > 1) continue;
      if (key.startsWith('@_')) {
        // Attribute - use without prefix
        const attrName = prefix + key.substring(2);
        flattened[attrName] = obj[key];
        continue;
      }

      const value = obj[key];
      const newKey = prefix + key;

      if (value === null || value === undefined) {
        flattened[newKey] = value;
      } else if (Array.isArray(value)) {
        // Convert arrays to JSON strings
        flattened[newKey] = JSON.stringify(value);
      } else if (typeof value === 'object') {
        // Special handling for text nodes
        if ('#text' in value && Object.keys(value).length === 1) {
          flattened[newKey] = value['#text'];
        } else {
          // Recursively flatten nested objects
          Object.assign(flattened, this.flattenObject(value, newKey + '.', maxDepth, currentDepth + 1));
        }
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  /**
   * Preview XML (first 100 items)
   */
  async preview(input, options = {}) {
    const data = await this.parse(input, options);
    return data.slice(0, 100);
  }

  /**
   * Get XML metadata
   */
  async getMetadata(input, options = {}) {
    const preview = await this.preview(input, options);

    return {
      format: 'xml',
      estimatedRows: preview.length,
      columnCount: preview.length > 0 ? Object.keys(preview[0]).length : 0,
      columns: preview.length > 0 ? Object.keys(preview[0]) : [],
      preview: preview.slice(0, 10)
    };
  }

  /**
   * Validate XML structure
   */
  validate(xmlString) {
    try {
      const parser = new FastXMLParser(this.defaultOptions);
      parser.parse(xmlString);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        line: error.line,
        column: error.column
      };
    }
  }

  /**
   * Detect repeating elements (potential arrays)
   */
  detectRepeatables(xmlString) {
    try {
      const parser = new FastXMLParser(this.defaultOptions);
      const parsed = parser.parse(xmlString);

      const repeatables = [];
      this.findRepeatablePaths(parsed, '', repeatables);

      return repeatables;
    } catch (error) {
      logger.error('Failed to detect repeatables', { error: error.message });
      return [];
    }
  }

  /**
   * Recursively find paths with arrays
   */
  findRepeatablePaths(obj, path, results) {
    if (typeof obj !== 'object' || obj === null) return;

    for (const key in obj) {
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (Array.isArray(value)) {
        results.push({
          path: currentPath,
          count: value.length,
          sample: value[0]
        });
      } else if (typeof value === 'object') {
        this.findRepeatablePaths(value, currentPath, results);
      }
    }
  }
}

module.exports = new XMLParser();
