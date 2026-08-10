/**
 * CSV Parser Service
 *
 * Parses CSV files with encoding detection, delimiter auto-detection, and header inference.
 */

const csv = require('csv-parser');
const fs = require('fs');
const { Readable } = require('stream');
const iconv = require('iconv-lite');
const chardet = require('chardet');
const logger = require('../../utils/logger');

class CSVParser {
  /**
   * Parse CSV file from path or buffer
   *
   * @param {string|Buffer} input - File path or buffer
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} - Parsed rows
   */
  async parse(input, options = {}) {
    const {
      delimiter = null,        // Auto-detect if null
      encoding = null,         // Auto-detect if null
      hasHeaders = true,
      skipLines = 0,
      maxRows = null,
      trimWhitespace = true
    } = options;

    try {
      // Detect encoding if not specified
      const detectedEncoding = encoding || await this.detectEncoding(input);

      // Detect delimiter if not specified
      const detectedDelimiter = delimiter || await this.detectDelimiter(input, detectedEncoding);

      logger.info('CSV parsing started', {
        encoding: detectedEncoding,
        delimiter: detectedDelimiter,
        hasHeaders
      });

      // Parse CSV
      const rows = await this.parseCSV(input, {
        encoding: detectedEncoding,
        delimiter: detectedDelimiter,
        hasHeaders,
        skipLines,
        maxRows,
        trimWhitespace
      });

      logger.info('CSV parsing completed', { rowCount: rows.length });

      return rows;
    } catch (error) {
      logger.error('CSV parsing failed', { error: error.message });
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
  }

  /**
   * Detect file encoding
   */
  async detectEncoding(input) {
    try {
      let buffer;

      if (Buffer.isBuffer(input)) {
        buffer = input.slice(0, 10000); // Sample first 10KB
      } else {
        // Read first 10KB from file
        const fd = fs.openSync(input, 'r');
        buffer = Buffer.alloc(10000);
        fs.readSync(fd, buffer, 0, 10000, 0);
        fs.closeSync(fd);
      }

      const detected = chardet.detect(buffer);
      return detected || 'utf-8';
    } catch (error) {
      logger.warn('Encoding detection failed, defaulting to utf-8', { error: error.message });
      return 'utf-8';
    }
  }

  /**
   * Detect CSV delimiter by analyzing first few lines
   */
  async detectDelimiter(input, encoding = 'utf-8') {
    try {
      let sample;

      if (Buffer.isBuffer(input)) {
        sample = iconv.decode(input.slice(0, 5000), encoding);
      } else {
        const fd = fs.openSync(input, 'r');
        const buffer = Buffer.alloc(5000);
        fs.readSync(fd, buffer, 0, 5000, 0);
        fs.closeSync(fd);
        sample = iconv.decode(buffer, encoding);
      }

      // Get first few lines
      const lines = sample.split('\n').slice(0, 5).filter(line => line.trim());

      if (lines.length === 0) {
        return ',';
      }

      // Count occurrences of common delimiters
      const delimiters = [',', ';', '\t', '|'];
      const counts = {};

      delimiters.forEach(delim => {
        counts[delim] = lines.map(line => {
          // Don't count delimiters inside quotes
          return (line.match(new RegExp(`${delim === '\t' ? '\\t' : delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'g')) || []).length;
        });
      });

      // Find delimiter with most consistent count across lines
      let bestDelimiter = ',';
      let bestScore = 0;

      Object.keys(counts).forEach(delim => {
        const delimCounts = counts[delim];
        const avg = delimCounts.reduce((a, b) => a + b, 0) / delimCounts.length;

        if (avg === 0) return;

        // Calculate consistency (lower variance = better)
        const variance = delimCounts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / delimCounts.length;
        const score = avg / (variance + 1); // Prefer high count with low variance

        if (score > bestScore) {
          bestScore = score;
          bestDelimiter = delim;
        }
      });

      return bestDelimiter;
    } catch (error) {
      logger.warn('Delimiter detection failed, defaulting to comma', { error: error.message });
      return ',';
    }
  }

  /**
   * Parse CSV with specified options
   */
  async parseCSV(input, options) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let stream;

      // Create readable stream
      if (Buffer.isBuffer(input)) {
        stream = Readable.from(iconv.decode(input, options.encoding));
      } else {
        stream = fs.createReadStream(input).pipe(iconv.decodeStream(options.encoding));
      }

      const csvOptions = {
        separator: options.delimiter,
        skipLines: options.skipLines,
        headers: options.hasHeaders ? undefined : false,
        mapHeaders: options.trimWhitespace ? ({ header }) => header.trim() : undefined,
        mapValues: options.trimWhitespace ? ({ value }) => typeof value === 'string' ? value.trim() : value : undefined
      };

      stream
        .pipe(csv(csvOptions))
        .on('data', (row) => {
          if (options.maxRows && rows.length >= options.maxRows) {
            stream.destroy();
            return;
          }
          rows.push(row);
        })
        .on('end', () => {
          resolve(rows);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Preview CSV (first 100 rows)
   */
  async preview(input, options = {}) {
    return this.parse(input, { ...options, maxRows: 100 });
  }

  /**
   * Get CSV metadata without parsing all data
   */
  async getMetadata(input, options = {}) {
    const encoding = options.encoding || await this.detectEncoding(input);
    const delimiter = options.delimiter || await this.detectDelimiter(input, encoding);
    const preview = await this.preview(input, { ...options, encoding, delimiter });

    return {
      encoding,
      delimiter,
      estimatedRows: await this.estimateRowCount(input, encoding),
      columnCount: preview.length > 0 ? Object.keys(preview[0]).length : 0,
      columns: preview.length > 0 ? Object.keys(preview[0]) : [],
      preview: preview.slice(0, 10)
    };
  }

  /**
   * Estimate total row count by sampling
   */
  async estimateRowCount(input, encoding = 'utf-8') {
    try {
      let fileSize;

      if (Buffer.isBuffer(input)) {
        fileSize = input.length;
      } else {
        const stats = fs.statSync(input);
        fileSize = stats.size;
      }

      // Sample first 100KB
      const sampleSize = Math.min(100000, fileSize);
      let buffer;

      if (Buffer.isBuffer(input)) {
        buffer = input.slice(0, sampleSize);
      } else {
        const fd = fs.openSync(input, 'r');
        buffer = Buffer.alloc(sampleSize);
        fs.readSync(fd, buffer, 0, sampleSize, 0);
        fs.closeSync(fd);
      }

      const sample = iconv.decode(buffer, encoding);
      const lines = sample.split('\n').length;
      const bytesPerLine = sampleSize / lines;

      return Math.round(fileSize / bytesPerLine);
    } catch (error) {
      logger.warn('Row count estimation failed', { error: error.message });
      return null;
    }
  }
}

module.exports = new CSVParser();
