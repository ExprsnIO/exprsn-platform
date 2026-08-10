/**
 * Excel Parser Service
 *
 * Parses Excel files (.xlsx, .xls) with support for multiple sheets.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const logger = require('../../utils/logger');

class ExcelParser {
  /**
   * Parse Excel file from path or buffer
   *
   * @param {string|Buffer} input - File path or buffer
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} - Parsed rows
   */
  async parse(input, options = {}) {
    const {
      sheetName = null,        // Specific sheet name (null = first sheet)
      sheetIndex = 0,          // Sheet index if name not specified
      hasHeaders = true,       // First row contains headers
      range = null,            // Cell range (e.g., "A1:D10")
      skipEmptyRows = true,
      dateNF = 'yyyy-mm-dd',   // Date number format
      rawNumbers = false,      // Don't format numbers
      defval = null            // Default value for empty cells
    } = options;

    try {
      // Read workbook
      const workbook = this.readWorkbook(input);

      // Get sheet
      const sheet = this.getSheet(workbook, sheetName, sheetIndex);

      if (!sheet) {
        throw new Error(`Sheet not found: ${sheetName || `index ${sheetIndex}`}`);
      }

      // Convert sheet to JSON
      const jsonOptions = {
        header: hasHeaders ? undefined : 1, // 1 = array of arrays
        range,
        defval,
        blankrows: !skipEmptyRows,
        raw: rawNumbers,
        dateNF
      };

      const data = XLSX.utils.sheet_to_json(sheet, jsonOptions);

      logger.info('Excel parsing completed', {
        rowCount: data.length,
        sheetName: sheetName || workbook.SheetNames[sheetIndex]
      });

      return data;
    } catch (error) {
      logger.error('Excel parsing failed', { error: error.message });
      throw new Error(`Excel parsing failed: ${error.message}`);
    }
  }

  /**
   * Read workbook from file or buffer
   */
  readWorkbook(input) {
    if (Buffer.isBuffer(input)) {
      return XLSX.read(input, { type: 'buffer' });
    } else if (typeof input === 'string') {
      return XLSX.readFile(input);
    } else {
      throw new Error('Invalid input type for Excel parser');
    }
  }

  /**
   * Get sheet by name or index
   */
  getSheet(workbook, sheetName, sheetIndex) {
    if (sheetName) {
      return workbook.Sheets[sheetName];
    } else {
      const name = workbook.SheetNames[sheetIndex];
      return name ? workbook.Sheets[name] : null;
    }
  }

  /**
   * Parse all sheets in workbook
   */
  async parseAllSheets(input, options = {}) {
    try {
      const workbook = this.readWorkbook(input);
      const results = {};

      for (const sheetName of workbook.SheetNames) {
        results[sheetName] = await this.parse(input, {
          ...options,
          sheetName
        });
      }

      return results;
    } catch (error) {
      logger.error('Failed to parse all sheets', { error: error.message });
      throw error;
    }
  }

  /**
   * Get workbook metadata
   */
  async getMetadata(input, options = {}) {
    try {
      const workbook = this.readWorkbook(input);
      const sheets = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

        // Get first few rows for preview
        const preview = await this.parse(input, {
          ...options,
          sheetName,
          range: `A1:${XLSX.utils.encode_col(range.e.c)}${Math.min(range.e.r + 1, 11)}`
        });

        sheets.push({
          name: sheetName,
          rowCount: range.e.r - range.s.r + 1,
          columnCount: range.e.c - range.s.c + 1,
          columns: preview.length > 0 ? Object.keys(preview[0]) : [],
          preview: preview.slice(0, 10)
        });
      }

      return {
        format: 'excel',
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        sheets
      };
    } catch (error) {
      logger.error('Failed to get Excel metadata', { error: error.message });
      throw error;
    }
  }

  /**
   * Preview Excel (first 100 rows)
   */
  async preview(input, options = {}) {
    const data = await this.parse(input, options);
    return data.slice(0, 100);
  }

  /**
   * Convert Excel to CSV
   */
  async toCSV(input, options = {}) {
    const {
      sheetName = null,
      sheetIndex = 0,
      delimiter = ',',
      linebreak = '\n'
    } = options;

    try {
      const workbook = this.readWorkbook(input);
      const sheet = this.getSheet(workbook, sheetName, sheetIndex);

      if (!sheet) {
        throw new Error(`Sheet not found: ${sheetName || `index ${sheetIndex}`}`);
      }

      return XLSX.utils.sheet_to_csv(sheet, {
        FS: delimiter,
        RS: linebreak
      });
    } catch (error) {
      logger.error('Excel to CSV conversion failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cell value by address
   */
  getCellValue(input, cellAddress, options = {}) {
    const {
      sheetName = null,
      sheetIndex = 0
    } = options;

    try {
      const workbook = this.readWorkbook(input);
      const sheet = this.getSheet(workbook, sheetName, sheetIndex);

      if (!sheet) {
        throw new Error(`Sheet not found: ${sheetName || `index ${sheetIndex}`}`);
      }

      const cell = sheet[cellAddress];
      return cell ? cell.v : null;
    } catch (error) {
      logger.error('Failed to get cell value', { error: error.message });
      return null;
    }
  }

  /**
   * Get range of cells
   */
  getRange(input, range, options = {}) {
    const {
      sheetName = null,
      sheetIndex = 0
    } = options;

    try {
      const workbook = this.readWorkbook(input);
      const sheet = this.getSheet(workbook, sheetName, sheetIndex);

      if (!sheet) {
        throw new Error(`Sheet not found: ${sheetName || `index ${sheetIndex}`}`);
      }

      const rangeObj = XLSX.utils.decode_range(range);
      const data = [];

      for (let R = rangeObj.s.r; R <= rangeObj.e.r; ++R) {
        const row = [];
        for (let C = rangeObj.s.c; C <= rangeObj.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[cellAddress];
          row.push(cell ? cell.v : null);
        }
        data.push(row);
      }

      return data;
    } catch (error) {
      logger.error('Failed to get range', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect data types for columns
   */
  detectColumnTypes(input, options = {}) {
    try {
      const data = this.parse(input, options);

      if (data.length === 0) {
        return {};
      }

      const types = {};
      const columns = Object.keys(data[0]);

      columns.forEach(col => {
        const values = data.slice(0, 100).map(row => row[col]).filter(v => v !== null && v !== undefined);

        if (values.length === 0) {
          types[col] = 'string';
          return;
        }

        // Check types
        const allNumbers = values.every(v => typeof v === 'number' || !isNaN(Number(v)));
        const allDates = values.every(v => v instanceof Date || !isNaN(Date.parse(v)));
        const allBooleans = values.every(v => typeof v === 'boolean' || ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase()));

        if (allNumbers) {
          types[col] = 'number';
        } else if (allDates) {
          types[col] = 'date';
        } else if (allBooleans) {
          types[col] = 'boolean';
        } else {
          types[col] = 'string';
        }
      });

      return types;
    } catch (error) {
      logger.error('Failed to detect column types', { error: error.message });
      return {};
    }
  }

  /**
   * Write data to Excel file
   */
  async write(data, outputPath, options = {}) {
    const {
      sheetName = 'Sheet1',
      bookType = 'xlsx'
    } = options;

    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, outputPath, { bookType });

      logger.info('Excel file written', { path: outputPath, rowCount: data.length });
    } catch (error) {
      logger.error('Failed to write Excel file', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ExcelParser();
