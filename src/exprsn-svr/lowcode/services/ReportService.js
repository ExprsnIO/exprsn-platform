/**
 * ReportService - Report Management and Execution Service
 * Handles CRUD operations, query execution, caching, and aggregations
 */

const { Report, ReportExecution, ReportSchedule, Application, DataSource, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

class ReportService {
  /**
   * Get all reports for an application
   */
  static async getReports(applicationId, options = {}) {
    try {
      const {
        status,
        reportType,
        category,
        page = 1,
        limit = 50,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      const where = { applicationId };
      if (status) where.status = status;
      if (reportType) where.reportType = reportType;
      if (category) where.category = category;

      const reports = await Report.findAll({
        where,
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        include: [{
          model: Application,
          as: 'application',
          attributes: ['id', 'displayName']
        }, {
          model: DataSource,
          as: 'dataSource',
          attributes: ['id', 'name', 'type'],
          required: false
        }]
      });

      const total = await Report.count({ where });

      return {
        success: true,
        data: reports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('[ReportService] Failed to get reports:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get report by ID
   */
  static async getReportById(reportId) {
    try {
      const report = await Report.findByPk(reportId, {
        include: [{
          model: Application,
          as: 'application',
          attributes: ['id', 'displayName']
        }, {
          model: DataSource,
          as: 'dataSource',
          required: false
        }]
      });

      if (!report) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Report not found'
        };
      }

      return {
        success: true,
        data: report
      };
    } catch (error) {
      console.error('[ReportService] Failed to get report:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create new report
   */
  static async createReport(data, userId = null) {
    try {
      const report = await Report.create({
        displayName: data.displayName,
        description: data.description,
        applicationId: data.applicationId,
        reportType: data.reportType || 'table',
        status: data.status || 'draft',
        dataSourceId: data.dataSourceId || null,
        queryConfig: data.queryConfig || {},
        rawSql: data.rawSql || null,
        parameters: data.parameters || [],
        visualizationConfig: data.visualizationConfig || {},
        cacheEnabled: data.cacheEnabled !== undefined ? data.cacheEnabled : true,
        cacheTTL: data.cacheTTL || 300,
        executionTimeout: data.executionTimeout || 30,
        category: data.category || null,
        tags: data.tags || [],
        createdBy: userId,
        modifiedBy: userId
      });

      return {
        success: true,
        data: report,
        message: 'Report created successfully'
      };
    } catch (error) {
      console.error('[ReportService] Failed to create report:', error);
      return {
        success: false,
        error: 'CREATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update report
   */
  static async updateReport(reportId, data, userId = null) {
    try {
      const report = await Report.findByPk(reportId);

      if (!report) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Report not found'
        };
      }

      const updates = { modifiedBy: userId };

      if (data.displayName !== undefined) updates.displayName = data.displayName;
      if (data.description !== undefined) updates.description = data.description;
      if (data.status !== undefined) updates.status = data.status;
      if (data.reportType !== undefined) updates.reportType = data.reportType;
      if (data.dataSourceId !== undefined) updates.dataSourceId = data.dataSourceId;
      if (data.queryConfig !== undefined) updates.queryConfig = data.queryConfig;
      if (data.rawSql !== undefined) updates.rawSql = data.rawSql;
      if (data.parameters !== undefined) updates.parameters = data.parameters;
      if (data.visualizationConfig !== undefined) updates.visualizationConfig = data.visualizationConfig;
      if (data.cacheEnabled !== undefined) updates.cacheEnabled = data.cacheEnabled;
      if (data.cacheTTL !== undefined) updates.cacheTTL = data.cacheTTL;
      if (data.executionTimeout !== undefined) updates.executionTimeout = data.executionTimeout;
      if (data.category !== undefined) updates.category = data.category;
      if (data.tags !== undefined) updates.tags = data.tags;

      // Increment version on publish
      if (data.status === 'published' && report.status !== 'published') {
        updates.version = report.version + 1;
      }

      await report.update(updates);

      return {
        success: true,
        data: report,
        message: 'Report updated successfully'
      };
    } catch (error) {
      console.error('[ReportService] Failed to update report:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete report
   */
  static async deleteReport(reportId) {
    try {
      const report = await Report.findByPk(reportId);

      if (!report) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Report not found'
        };
      }

      await report.destroy();

      return {
        success: true,
        message: 'Report deleted successfully'
      };
    } catch (error) {
      console.error('[ReportService] Failed to delete report:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Build SQL query from queryConfig
   */
  static buildQueryFromConfig(queryConfig) {
    try {
      const {
        entities = [],       // Tables to query
        fields = [],         // Columns to select
        joins = [],          // JOIN clauses
        filters = [],        // WHERE conditions
        groupBy = [],        // GROUP BY columns
        orderBy = [],        // ORDER BY columns
        limit = null,        // LIMIT
        offset = null        // OFFSET
      } = queryConfig;

      // Build SELECT clause
      let selectClause = 'SELECT ';
      if (fields.length === 0) {
        selectClause += '*';
      } else {
        selectClause += fields.map(f => {
          if (f.aggregation) {
            return `${f.aggregation}(${f.column}) AS ${f.alias || f.column}`;
          }
          return f.alias ? `${f.column} AS ${f.alias}` : f.column;
        }).join(', ');
      }

      // Build FROM clause
      if (entities.length === 0) {
        throw new Error('At least one entity (table) must be specified');
      }
      let fromClause = ` FROM ${entities[0]}`;

      // Build JOIN clauses
      if (joins.length > 0) {
        fromClause += ' ' + joins.map(j => {
          const joinType = (j.type || 'INNER').toUpperCase();
          return `${joinType} JOIN ${j.table} ON ${j.condition}`;
        }).join(' ');
      }

      // Build WHERE clause
      let whereClause = '';
      if (filters.length > 0) {
        const conditions = filters.map(f => {
          const operator = f.operator || '=';
          if (f.value === null) {
            return operator === '=' ? `${f.column} IS NULL` : `${f.column} IS NOT NULL`;
          }
          // Use placeholders for parameter binding
          if (f.parameter) {
            return `${f.column} ${operator} :${f.parameter}`;
          }
          return `${f.column} ${operator} ${this.formatValue(f.value)}`;
        });
        whereClause = ' WHERE ' + conditions.join(' AND ');
      }

      // Build GROUP BY clause
      let groupByClause = '';
      if (groupBy.length > 0) {
        groupByClause = ' GROUP BY ' + groupBy.join(', ');
      }

      // Build ORDER BY clause
      let orderByClause = '';
      if (orderBy.length > 0) {
        orderByClause = ' ORDER BY ' + orderBy.map(o =>
          `${o.column} ${(o.direction || 'ASC').toUpperCase()}`
        ).join(', ');
      }

      // Build LIMIT/OFFSET clause
      let limitClause = '';
      if (limit) {
        limitClause = ` LIMIT ${parseInt(limit)}`;
        if (offset) {
          limitClause += ` OFFSET ${parseInt(offset)}`;
        }
      }

      const sql = selectClause + fromClause + whereClause + groupByClause + orderByClause + limitClause;
      return { success: true, sql };
    } catch (error) {
      console.error('[ReportService] Failed to build query:', error);
      return {
        success: false,
        error: 'QUERY_BUILD_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Format value for SQL query
   */
  static formatValue(value) {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return 'NULL';
  }

  /**
   * Execute a report
   */
  static async executeReport(reportId, parameterValues = {}, userId = null) {
    const startTime = Date.now();
    let execution = null;

    try {
      // Get report
      const report = await Report.findByPk(reportId);
      if (!report) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Report not found'
        };
      }

      // Create execution record
      execution = await ReportExecution.create({
        reportId: report.id,
        applicationId: report.applicationId,
        executedBy: userId,
        executionType: 'manual',
        status: 'running',
        startedAt: new Date(),
        queryParameters: parameterValues
      });

      // Check cache
      if (report.cacheEnabled) {
        const cachedExecution = await this.getCachedExecution(reportId, parameterValues);
        if (cachedExecution) {
          await execution.update({
            status: 'completed',
            completedAt: new Date(),
            executionTime: Date.now() - startTime,
            resultData: cachedExecution.resultData,
            resultMetadata: cachedExecution.resultMetadata,
            resultCount: cachedExecution.resultCount
          });

          return {
            success: true,
            data: cachedExecution.resultData,
            metadata: cachedExecution.resultMetadata,
            cached: true,
            executionId: execution.id
          };
        }
      }

      // Build or use raw SQL
      let sql;
      if (report.rawSql) {
        sql = report.rawSql;
      } else {
        const buildResult = this.buildQueryFromConfig(report.queryConfig);
        if (!buildResult.success) {
          throw new Error(buildResult.message);
        }
        sql = buildResult.sql;
      }

      // Execute query
      await execution.update({ executedQuery: sql });

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: parameterValues,
        timeout: report.executionTimeout * 1000
      });

      // Calculate metadata
      const metadata = {
        columns: results.length > 0 ? Object.keys(results[0]) : [],
        rowCount: results.length,
        executionTime: Date.now() - startTime
      };

      // Update execution record
      await execution.update({
        status: 'completed',
        completedAt: new Date(),
        executionTime: metadata.executionTime,
        resultData: results,
        resultMetadata: metadata,
        resultCount: results.length,
        isCached: true,
        cacheExpiresAt: new Date(Date.now() + report.cacheTTL * 1000)
      });

      // Update report stats
      await report.updateExecutionStats(metadata.executionTime);

      return {
        success: true,
        data: results,
        metadata,
        cached: false,
        executionId: execution.id
      };
    } catch (error) {
      console.error('[ReportService] Failed to execute report:', error);

      // Update execution record with error
      if (execution) {
        await execution.update({
          status: 'failed',
          completedAt: new Date(),
          executionTime: Date.now() - startTime,
          errorMessage: error.message,
          errorStack: error.stack
        });
      }

      return {
        success: false,
        error: 'EXECUTION_FAILED',
        message: error.message,
        executionId: execution?.id
      };
    }
  }

  /**
   * Get cached execution result
   */
  static async getCachedExecution(reportId, parameterValues) {
    try {
      const cachedExecution = await ReportExecution.findOne({
        where: {
          reportId,
          status: 'completed',
          isCached: true,
          queryParameters: parameterValues
        },
        where: sequelize.where(
          sequelize.col('cache_expires_at'),
          '>',
          new Date()
        ),
        order: [['completed_at', 'DESC']]
      });

      return cachedExecution;
    } catch (error) {
      console.error('[ReportService] Failed to get cached execution:', error);
      return null;
    }
  }

  /**
   * Get report execution history
   */
  static async getExecutionHistory(reportId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;

      const executions = await ReportExecution.findAll({
        where: { reportId },
        order: [['started_at', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        attributes: ['id', 'executionType', 'status', 'startedAt', 'completedAt', 'executionTime', 'resultCount', 'errorMessage']
      });

      const total = await ReportExecution.count({ where: { reportId } });

      return {
        success: true,
        data: executions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('[ReportService] Failed to get execution history:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Duplicate report
   */
  static async duplicateReport(reportId, userId = null) {
    try {
      const original = await Report.findByPk(reportId);

      if (!original) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Report not found'
        };
      }

      const duplicate = await Report.create({
        displayName: `${original.displayName} (Copy)`,
        description: original.description,
        applicationId: original.applicationId,
        reportType: original.reportType,
        status: 'draft',
        dataSourceId: original.dataSourceId,
        queryConfig: original.queryConfig,
        rawSql: original.rawSql,
        parameters: original.parameters,
        visualizationConfig: original.visualizationConfig,
        cacheEnabled: original.cacheEnabled,
        cacheTTL: original.cacheTTL,
        executionTimeout: original.executionTimeout,
        category: original.category,
        tags: original.tags,
        createdBy: userId,
        modifiedBy: userId
      });

      return {
        success: true,
        data: duplicate,
        message: 'Report duplicated successfully'
      };
    } catch (error) {
      console.error('[ReportService] Failed to duplicate report:', error);
      return {
        success: false,
        error: 'DUPLICATE_FAILED',
        message: error.message
      };
    }
  }
}

module.exports = ReportService;
