/**
 * Dataset Service
 * Manages dataset creation, storage, and caching
 */

const { Dataset, Query } = require('../models');
const QueryEngine = require('./QueryEngine');
const logger = require('../utils/logger');

class DatasetService {
  /**
   * Create a dataset from query execution
   */
  static async createFromQuery(queryId, parameters = {}, userId, options = {}) {
    try {
      const query = await Query.findByPk(queryId);
      if (!query) {
        throw new Error('Query not found');
      }

      // Execute query
      const result = await QueryEngine.execute(queryId, parameters, options);

      // Calculate dataset size
      const dataString = JSON.stringify(result.data);
      const size = Buffer.byteLength(dataString, 'utf8');

      // Calculate expiration
      const expiresAt = options.isSnapshot
        ? null
        : new Date(Date.now() + (query.cacheTTL || 300) * 1000);

      // Create dataset
      const dataset = await Dataset.create({
        queryId,
        name: options.name || `${query.name} - ${new Date().toISOString()}`,
        data: result.data,
        schema: result.schema,
        rowCount: result.rowCount,
        columnCount: result.columnCount,
        size,
        executionTime: result.executionTime,
        parameters,
        expiresAt,
        isSnapshot: options.isSnapshot || false,
        createdBy: userId,
        metadata: {
          cached: result.cached,
          ...options.metadata
        }
      });

      logger.info('Dataset created', {
        datasetId: dataset.id,
        queryId,
        rowCount: dataset.rowCount,
        size: dataset.size
      });

      return dataset;
    } catch (error) {
      logger.error('Failed to create dataset', {
        queryId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get dataset by ID
   */
  static async getById(id, options = {}) {
    const dataset = await Dataset.findByPk(id, {
      include: options.includeQuery ? [{ model: Query, as: 'query' }] : []
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    // Check if dataset has expired
    if (dataset.expiresAt && new Date() > dataset.expiresAt && !dataset.isSnapshot) {
      logger.warn('Dataset expired', { datasetId: id });

      if (options.autoRefresh) {
        return await this.refresh(id);
      }
    }

    return dataset;
  }

  /**
   * Refresh an expired dataset
   */
  static async refresh(datasetId) {
    const dataset = await Dataset.findByPk(datasetId, {
      include: [{ model: Query, as: 'query' }]
    });

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    logger.info('Refreshing dataset', { datasetId });

    // Execute query again with same parameters
    const result = await QueryEngine.execute(dataset.queryId, dataset.parameters);

    // Update dataset
    const dataString = JSON.stringify(result.data);
    const size = Buffer.byteLength(dataString, 'utf8');

    const expiresAt = dataset.isSnapshot
      ? null
      : new Date(Date.now() + (dataset.query.cacheTTL || 300) * 1000);

    await dataset.update({
      data: result.data,
      schema: result.schema,
      rowCount: result.rowCount,
      columnCount: result.columnCount,
      size,
      executionTime: result.executionTime,
      expiresAt
    });

    return dataset;
  }

  /**
   * List datasets with filtering
   */
  static async list(filters = {}, pagination = {}) {
    const where = {};

    if (filters.queryId) where.queryId = filters.queryId;
    if (filters.isSnapshot !== undefined) where.isSnapshot = filters.isSnapshot;
    if (filters.createdBy) where.createdBy = filters.createdBy;

    const options = {
      where,
      order: [['createdAt', 'DESC']],
      include: filters.includeQuery ? [{ model: Query, as: 'query' }] : []
    };

    if (pagination.limit) {
      options.limit = pagination.limit;
      options.offset = pagination.offset || 0;
    }

    const { rows, count } = await Dataset.findAndCountAll(options);

    return {
      datasets: rows,
      total: count,
      page: pagination.offset ? Math.floor(pagination.offset / pagination.limit) + 1 : 1,
      pages: pagination.limit ? Math.ceil(count / pagination.limit) : 1
    };
  }

  /**
   * Delete dataset
   */
  static async delete(id) {
    const dataset = await Dataset.findByPk(id);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    await dataset.destroy();
    logger.info('Dataset deleted', { datasetId: id });
  }

  /**
   * Clean up expired datasets
   */
  static async cleanupExpired() {
    const { Op } = require('sequelize');

    const expired = await Dataset.findAll({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        },
        isSnapshot: false
      }
    });

    for (const dataset of expired) {
      await dataset.destroy();
    }

    logger.info('Expired datasets cleaned up', { count: expired.length });
    return expired.length;
  }

  /**
   * Get dataset statistics
   */
  static async getStatistics(datasetId) {
    const dataset = await this.getById(datasetId);

    if (!dataset.data || dataset.data.length === 0) {
      return { error: 'No data available' };
    }

    const stats = {
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
      size: dataset.size,
      columns: {}
    };

    // Calculate statistics for each column
    for (const column in dataset.schema) {
      const values = dataset.data.map(row => row[column]).filter(v => v !== null && v !== undefined);

      const columnStats = {
        type: dataset.schema[column].type,
        count: values.length,
        nullCount: dataset.rowCount - values.length
      };

      if (dataset.schema[column].type === 'number') {
        const numbers = values.map(v => parseFloat(v));
        columnStats.min = Math.min(...numbers);
        columnStats.max = Math.max(...numbers);
        columnStats.sum = numbers.reduce((a, b) => a + b, 0);
        columnStats.avg = columnStats.sum / numbers.length;
        columnStats.median = this._calculateMedian(numbers);
      } else if (dataset.schema[column].type === 'string') {
        columnStats.minLength = Math.min(...values.map(v => v.length));
        columnStats.maxLength = Math.max(...values.map(v => v.length));
        columnStats.uniqueCount = new Set(values).size;
      }

      stats.columns[column] = columnStats;
    }

    return stats;
  }

  /**
   * Calculate median of numbers array
   */
  static _calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Apply transformations to dataset
   */
  static async transform(datasetId, transformations, userId) {
    const dataset = await this.getById(datasetId);

    const JSONLexService = require('./JSONLexService');
    const transformedData = JSONLexService.transformDataset(dataset.data, transformations);

    // Create new dataset with transformed data
    const newDataset = await Dataset.create({
      queryId: dataset.queryId,
      name: `${dataset.name} (Transformed)`,
      data: transformedData,
      schema: this._extractSchema(transformedData),
      rowCount: transformedData.length,
      columnCount: Object.keys(transformedData[0] || {}).length,
      size: Buffer.byteLength(JSON.stringify(transformedData), 'utf8'),
      parameters: dataset.parameters,
      isSnapshot: true,
      createdBy: userId,
      metadata: {
        sourceDatasetId: datasetId,
        transformations
      }
    });

    return newDataset;
  }

  /**
   * Extract schema from data
   */
  static _extractSchema(data) {
    if (!data || data.length === 0) return {};

    const schema = {};
    const firstRow = data[0];

    for (const key in firstRow) {
      const value = firstRow[key];
      schema[key] = {
        name: key,
        type: Array.isArray(value) ? 'array' : typeof value,
        nullable: value === null || value === undefined
      };
    }

    return schema;
  }

  /**
   * Export dataset to CSV
   */
  static async exportToCSV(datasetId) {
    const dataset = await this.getById(datasetId);

    const { stringify } = require('csv-stringify/sync');

    const csv = stringify(dataset.data, {
      header: true,
      columns: Object.keys(dataset.schema)
    });

    return csv;
  }

  /**
   * Export dataset to Excel
   */
  static async exportToExcel(datasetId) {
    const dataset = await this.getById(datasetId);
    const ExcelJS = require('exceljs');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');

    // Add headers
    const columns = Object.keys(dataset.schema).map(key => ({
      header: key,
      key,
      width: 20
    }));

    worksheet.columns = columns;

    // Add data
    dataset.data.forEach(row => {
      worksheet.addRow(row);
    });

    // Style header
    worksheet.getRow(1).font = { bold: true };

    return await workbook.xlsx.writeBuffer();
  }
}

module.exports = DatasetService;
