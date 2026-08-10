/**
 * TSV Parser Service
 *
 * Parses TSV (Tab-Separated Values) files. Extends CSV parser with tab delimiter.
 */

const CSVParser = require('./CSVParser');

class TSVParser {
  /**
   * Parse TSV file from path or buffer
   *
   * @param {string|Buffer} input - File path or buffer
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} - Parsed rows
   */
  async parse(input, options = {}) {
    return CSVParser.parse(input, {
      ...options,
      delimiter: '\t' // Force tab delimiter
    });
  }

  /**
   * Preview TSV (first 100 rows)
   */
  async preview(input, options = {}) {
    return CSVParser.preview(input, {
      ...options,
      delimiter: '\t'
    });
  }

  /**
   * Get TSV metadata
   */
  async getMetadata(input, options = {}) {
    return CSVParser.getMetadata(input, {
      ...options,
      delimiter: '\t'
    });
  }
}

module.exports = new TSVParser();
