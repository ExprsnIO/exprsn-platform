/**
 * Data Import Service
 *
 * Orchestrates data import from multiple sources with transformation and schema inference.
 * Similar to Power Query data import and transformation pipeline.
 */

const fs = require('fs');
const path = require('path');
const { DataImport } = require('../models');
const CSVParser = require('./parsers/CSVParser');
const TSVParser = require('./parsers/TSVParser');
const JSONParser = require('./parsers/JSONParser');
const XMLParser = require('./parsers/XMLParser');
const ExcelParser = require('./parsers/ExcelParser');
const TransformationEngine = require('./TransformationEngine');
const SchemaInferenceService = require('./SchemaInferenceService');
const logger = require('../utils/logger');

class DataImportService {
  constructor() {
    this.parsers = {
      csv: CSVParser,
      tsv: TSVParser,
      json: JSONParser,
      xml: XMLParser,
      excel: ExcelParser,
      xlsx: ExcelParser,
      xls: ExcelParser
    };
  }

  /**
   * Import data from file or URL
   *
   * @param {Object} config - Import configuration
   * @returns {Promise<Object>} - Import result with data and metadata
   */
  async importData(config) {
    const {
      dataSourceId,
      source,              // File path, buffer, or URL
      sourceType,          // csv, tsv, json, xml, excel
      parserOptions = {},  // Parser-specific options
      transformations = [], // Array of transformation steps
      inferSchema = true,  // Auto-detect schema
      sampleSize = 1000,   // Rows for schema inference
      userId = null        // User triggering import
    } = config;

    // Create import record
    const importRecord = await DataImport.create({
      dataSourceId,
      status: 'pending',
      triggeredBy: userId,
      metadata: {
        sourceType,
        parserOptions,
        transformationCount: transformations.length
      }
    });

    try {
      await importRecord.markRunning();

      // Step 1: Parse source data
      logger.info('Starting data import', {
        importId: importRecord.id,
        sourceType,
        dataSourceId
      });

      const rawData = await this.parseSource(source, sourceType, parserOptions);

      logger.info('Data parsed successfully', {
        importId: importRecord.id,
        rowCount: rawData.length
      });

      // Step 2: Infer schema if requested
      let schema = null;
      if (inferSchema) {
        schema = SchemaInferenceService.inferSchema(rawData, { sampleSize });
        logger.info('Schema inferred', {
          importId: importRecord.id,
          columnCount: schema.columns.length
        });
      }

      // Step 3: Apply transformations
      let transformedData = rawData;
      let transformationLog = [];
      let errors = [];

      if (transformations.length > 0) {
        const result = await TransformationEngine.applyTransformations(rawData, transformations);
        transformedData = result.data;
        transformationLog = result.transformationLog;
        errors = result.errors;

        logger.info('Transformations applied', {
          importId: importRecord.id,
          stepCount: transformations.length,
          errorCount: errors.length,
          finalRowCount: transformedData.length
        });
      }

      // Step 4: Save results
      await importRecord.update({
        sourceData: this.sampleData(rawData, 100),
        transformedData: this.sampleData(transformedData, 100),
        transformationLog,
        errors: errors.length > 0 ? errors : null
      });

      await importRecord.markSuccess({
        rowsImported: rawData.length,
        rowsTransformed: transformedData.length,
        rowsWithErrors: errors.length
      });

      return {
        success: true,
        importId: importRecord.id,
        data: transformedData,
        schema,
        stats: {
          rowsImported: rawData.length,
          rowsTransformed: transformedData.length,
          rowsWithErrors: errors.length,
          columnCount: transformedData.length > 0 ? Object.keys(transformedData[0]).length : 0
        },
        transformationLog,
        errors
      };
    } catch (error) {
      logger.error('Data import failed', {
        importId: importRecord.id,
        error: error.message,
        stack: error.stack
      });

      await importRecord.markError(error);

      throw error;
    }
  }

  /**
   * Parse source data using appropriate parser
   */
  async parseSource(source, sourceType, options = {}) {
    const parser = this.parsers[sourceType.toLowerCase()];

    if (!parser) {
      throw new Error(`Unsupported source type: ${sourceType}`);
    }

    return parser.parse(source, options);
  }

  /**
   * Preview import before executing
   *
   * @param {Object} config - Import configuration
   * @returns {Promise<Object>} - Preview with sample data and metadata
   */
  async previewImport(config) {
    const {
      source,
      sourceType,
      parserOptions = {},
      transformations = [],
      inferSchema = true,
      sampleSize = 100
    } = config;

    try {
      const parser = this.parsers[sourceType.toLowerCase()];

      if (!parser) {
        throw new Error(`Unsupported source type: ${sourceType}`);
      }

      // Get preview data (limited rows)
      const previewData = await parser.preview(source, parserOptions);

      // Infer schema
      let schema = null;
      if (inferSchema) {
        schema = SchemaInferenceService.inferSchema(previewData, { sampleSize });
      }

      // Apply transformations to preview
      let transformedPreview = previewData;
      if (transformations.length > 0) {
        const result = await TransformationEngine.applyTransformations(previewData, transformations);
        transformedPreview = result.data;
      }

      return {
        success: true,
        preview: {
          original: previewData.slice(0, 10),
          transformed: transformedPreview.slice(0, 10)
        },
        schema,
        stats: {
          sampleRows: previewData.length,
          transformedRows: transformedPreview.length,
          columnCount: previewData.length > 0 ? Object.keys(previewData[0]).length : 0
        }
      };
    } catch (error) {
      logger.error('Preview failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get source metadata without importing
   *
   * @param {string|Buffer} source - Data source
   * @param {string} sourceType - Source type
   * @param {Object} options - Parser options
   * @returns {Promise<Object>} - Metadata
   */
  async getSourceMetadata(source, sourceType, options = {}) {
    try {
      const parser = this.parsers[sourceType.toLowerCase()];

      if (!parser) {
        throw new Error(`Unsupported source type: ${sourceType}`);
      }

      if (typeof parser.getMetadata === 'function') {
        return parser.getMetadata(source, options);
      }

      // Fallback: preview and generate metadata
      const preview = await parser.preview(source, options);
      return {
        format: sourceType,
        estimatedRows: preview.length,
        columnCount: preview.length > 0 ? Object.keys(preview[0]).length : 0,
        columns: preview.length > 0 ? Object.keys(preview[0]) : [],
        preview: preview.slice(0, 10)
      };
    } catch (error) {
      logger.error('Failed to get source metadata', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate transformation pipeline
   *
   * @param {Array} data - Sample data
   * @param {Array} transformations - Transformation steps
   * @returns {Promise<Object>} - Validation result
   */
  async validateTransformations(data, transformations) {
    try {
      const result = await TransformationEngine.applyTransformations(data, transformations);

      return {
        valid: result.errors.length === 0,
        errors: result.errors,
        warnings: result.transformationLog.filter(log => !log.success),
        preview: result.data.slice(0, 10)
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ error: error.message }],
        warnings: [],
        preview: []
      };
    }
  }

  /**
   * Get import history for data source
   *
   * @param {string} dataSourceId - Data source ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Import records
   */
  async getImportHistory(dataSourceId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      status = null
    } = options;

    const where = { dataSourceId };
    if (status) {
      where.status = status;
    }

    return DataImport.findAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get import by ID
   *
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} - Import record
   */
  async getImport(importId) {
    const importRecord = await DataImport.findByPk(importId);

    if (!importRecord) {
      throw new Error(`Import not found: ${importId}`);
    }

    return importRecord;
  }

  /**
   * Retry failed import
   *
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} - New import result
   */
  async retryImport(importId) {
    const originalImport = await this.getImport(importId);

    if (originalImport.status !== 'error') {
      throw new Error('Can only retry failed imports');
    }

    // Extract config from original import
    const config = {
      dataSourceId: originalImport.dataSourceId,
      source: originalImport.metadata.source,
      sourceType: originalImport.metadata.sourceType,
      parserOptions: originalImport.metadata.parserOptions || {},
      transformations: originalImport.metadata.transformations || [],
      userId: originalImport.triggeredBy
    };

    return this.importData(config);
  }

  /**
   * Cancel running import
   *
   * @param {string} importId - Import ID
   */
  async cancelImport(importId) {
    const importRecord = await this.getImport(importId);

    if (importRecord.status !== 'running') {
      throw new Error('Can only cancel running imports');
    }

    await importRecord.update({
      status: 'cancelled',
      completedAt: new Date()
    });

    logger.info('Import cancelled', { importId });
  }

  /**
   * Delete import record
   *
   * @param {string} importId - Import ID
   */
  async deleteImport(importId) {
    const importRecord = await this.getImport(importId);
    await importRecord.destroy();
    logger.info('Import deleted', { importId });
  }

  /**
   * Export transformation pipeline as reusable template
   *
   * @param {string} importId - Import ID
   * @param {string} templateName - Template name
   * @returns {Object} - Template definition
   */
  async exportTemplate(importId, templateName) {
    const importRecord = await this.getImport(importId);

    return {
      name: templateName,
      sourceType: importRecord.metadata.sourceType,
      parserOptions: importRecord.metadata.parserOptions,
      transformations: importRecord.transformationLog.map(log => ({
        type: log.stepType,
        // Additional params would be stored in transformationLog
      })),
      createdAt: new Date()
    };
  }

  /**
   * Suggest transformations based on schema inference
   *
   * @param {Array} data - Sample data
   * @returns {Array} - Suggested transformation steps
   */
  async suggestTransformations(data) {
    const schema = SchemaInferenceService.inferSchema(data, { sampleSize: 100 });
    const suggestions = [];

    // Suggest type conversions
    schema.columns.forEach(col => {
      if (col.type !== col.suggestedType) {
        suggestions.push({
          type: 'changeType',
          params: {
            columnName: col.name,
            targetType: col.suggestedType
          },
          reason: `Column appears to be ${col.suggestedType} but is detected as ${col.type}`
        });
      }

      // Suggest removing high-null columns
      if (col.dataQuality.completeness < 50) {
        suggestions.push({
          type: 'removeColumn',
          params: {
            columnName: col.name
          },
          reason: `Column has ${col.nullCount} null values (${(100 - col.dataQuality.completeness).toFixed(1)}%)`
        });
      }

      // Suggest removing constant columns
      if (col.uniqueCount === 1 && col.dataQuality.completeness > 50) {
        suggestions.push({
          type: 'removeColumn',
          params: {
            columnName: col.name
          },
          reason: 'Column has the same value in all rows'
        });
      }
    });

    // Suggest duplicate removal
    suggestions.push({
      type: 'removeDuplicates',
      params: {},
      reason: 'Remove duplicate rows to ensure data quality'
    });

    return suggestions;
  }

  /**
   * Sample data for storage (limit size)
   */
  sampleData(data, maxRows = 100) {
    if (!data || data.length === 0) return [];
    return data.slice(0, maxRows);
  }

  /**
   * Detect file type from file path or buffer
   */
  detectFileType(input) {
    if (typeof input === 'string') {
      const ext = path.extname(input).toLowerCase().replace('.', '');
      return ext || null;
    }

    if (Buffer.isBuffer(input)) {
      // Try to detect from content
      const header = input.slice(0, 4).toString('hex');

      // Excel files (ZIP format)
      if (header === '504b0304') return 'xlsx';

      // Old Excel files
      if (header === 'd0cf11e0') return 'xls';

      // Try to parse as text
      const text = input.toString('utf-8', 0, 100);

      if (text.startsWith('<?xml')) return 'xml';
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) return 'json';

      // Default to CSV
      return 'csv';
    }

    return null;
  }
}

module.exports = new DataImportService();
