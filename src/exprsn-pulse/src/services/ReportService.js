/**
 * Report Service
 * Handles report creation, execution, and export
 */

const { Report, ReportParameter, Filter, Query, Dataset } = require('../models');
const QueryEngine = require('./QueryEngine');
const logger = require('../utils/logger');
const Handlebars = require('handlebars');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const { stringify } = require('csv-stringify/sync');

class ReportService {
  /**
   * Create a new report
   */
  static async create(data, userId) {
    try {
      const report = await Report.create({
        ...data,
        createdBy: userId
      });

      // Create parameters if provided
      if (data.parameters && data.parameters.length > 0) {
        for (const param of data.parameters) {
          await ReportParameter.create({
            reportId: report.id,
            ...param
          });
        }
      }

      // Create filters if provided
      if (data.filters && data.filters.length > 0) {
        for (const filter of data.filters) {
          await Filter.create({
            reportId: report.id,
            createdBy: userId,
            ...filter
          });
        }
      }

      logger.info('Report created', {
        reportId: report.id,
        name: report.name,
        type: report.type
      });

      return await this.getById(report.id);
    } catch (error) {
      logger.error('Failed to create report', { error: error.message });
      throw error;
    }
  }

  /**
   * Get report by ID with all related data
   */
  static async getById(id) {
    return await Report.findByPk(id, {
      include: [
        { model: ReportParameter, as: 'parameters', order: [['order', 'ASC']] },
        { model: Filter, as: 'filters' }
      ]
    });
  }

  /**
   * Execute report and generate output
   */
  static async execute(reportId, parameterValues = {}, options = {}) {
    const report = await this.getById(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    const startTime = Date.now();

    try {
      // Validate parameters
      const validatedParams = this._validateParameters(report.parameters, parameterValues);

      // Execute queries defined in report
      const data = await this._executeReportQueries(report, validatedParams);

      // Apply filters
      const filteredData = this._applyReportFilters(data, report.filters);

      // Generate report output based on format
      let output;
      const format = options.format || report.format;

      switch (format) {
        case 'pdf':
          output = await this._generatePDF(report, filteredData, validatedParams);
          break;
        case 'excel':
          output = await this._generateExcel(report, filteredData, validatedParams);
          break;
        case 'csv':
          output = await this._generateCSV(report, filteredData);
          break;
        case 'html':
          output = await this._generateHTML(report, filteredData, validatedParams);
          break;
        case 'json':
          output = JSON.stringify(filteredData, null, 2);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      const executionTime = Date.now() - startTime;

      // Update report statistics
      await this._updateReportStats(report, executionTime);

      logger.info('Report executed successfully', {
        reportId,
        format,
        executionTime,
        rowCount: Array.isArray(filteredData) ? filteredData.length : Object.keys(filteredData).length
      });

      return {
        reportId: report.id,
        name: report.name,
        format,
        output,
        executionTime,
        generatedAt: new Date().toISOString(),
        parameters: validatedParams
      };
    } catch (error) {
      logger.error('Report execution failed', {
        reportId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate report parameters
   */
  static _validateParameters(paramDefs, values) {
    const validated = {};

    for (const param of paramDefs) {
      let value = values[param.name];

      // Use default if not provided
      if (value === undefined || value === null) {
        if (param.required) {
          throw new Error(`Required parameter '${param.name}' is missing`);
        }
        value = param.defaultValue;
      }

      // Type validation
      switch (param.type) {
        case 'number':
          value = parseFloat(value);
          if (isNaN(value)) {
            throw new Error(`Parameter '${param.name}' must be a number`);
          }
          break;
        case 'boolean':
          value = value === 'true' || value === true;
          break;
        case 'date':
        case 'datetime':
          value = new Date(value);
          if (isNaN(value.getTime())) {
            throw new Error(`Parameter '${param.name}' must be a valid date`);
          }
          break;
      }

      // Custom validation rules
      if (param.validation) {
        if (param.validation.min !== undefined && value < param.validation.min) {
          throw new Error(`Parameter '${param.name}' must be >= ${param.validation.min}`);
        }
        if (param.validation.max !== undefined && value > param.validation.max) {
          throw new Error(`Parameter '${param.name}' must be <= ${param.validation.max}`);
        }
        if (param.validation.pattern) {
          const regex = new RegExp(param.validation.pattern);
          if (!regex.test(value)) {
            throw new Error(`Parameter '${param.name}' does not match required pattern`);
          }
        }
      }

      validated[param.name] = value;
    }

    return validated;
  }

  /**
   * Execute queries defined in report
   */
  static async _executeReportQueries(report, parameters) {
    const definition = report.definition;

    // Report can have multiple queries
    if (definition.queries) {
      const results = {};

      for (const queryDef of definition.queries) {
        const data = await QueryEngine.execute(queryDef.queryId, parameters);
        results[queryDef.name || `query_${queryDef.queryId}`] = data.data;
      }

      return results;
    }

    // Or single query
    if (definition.queryId) {
      const data = await QueryEngine.execute(definition.queryId, parameters);
      return data.data;
    }

    throw new Error('Report definition must contain queries');
  }

  /**
   * Apply report filters to data
   */
  static _applyReportFilters(data, filters) {
    if (!filters || filters.length === 0) {
      return data;
    }

    const activeFilters = filters.filter(f => f.isActive);
    if (activeFilters.length === 0) {
      return data;
    }

    // If data is object with multiple datasets
    if (typeof data === 'object' && !Array.isArray(data)) {
      const filtered = {};
      for (const [key, dataset] of Object.entries(data)) {
        filtered[key] = this._applyFiltersToDataset(dataset, activeFilters);
      }
      return filtered;
    }

    // Single dataset
    return this._applyFiltersToDataset(data, activeFilters);
  }

  /**
   * Apply filters to a single dataset
   */
  static _applyFiltersToDataset(dataset, filters) {
    return dataset.filter(row => {
      return filters.every(filter => {
        const value = row[filter.field];
        const filterValue = filter.value;

        switch (filter.operator) {
          case 'equals':
            return value == filterValue;
          case 'not_equals':
            return value != filterValue;
          case 'contains':
            return filter.caseSensitive
              ? String(value).includes(filterValue)
              : String(value).toLowerCase().includes(String(filterValue).toLowerCase());
          case 'greater_than':
            return value > filterValue;
          case 'less_than':
            return value < filterValue;
          case 'between':
            return value >= filterValue[0] && value <= filterValue[1];
          case 'in':
            return Array.isArray(filterValue) && filterValue.includes(value);
          case 'is_null':
            return value === null || value === undefined;
          case 'is_not_null':
            return value !== null && value !== undefined;
          default:
            return true;
        }
      });
    });
  }

  /**
   * Generate PDF report
   */
  static async _generatePDF(report, data, parameters) {
    // Generate HTML first
    const html = await this._generateHTML(report, data, parameters);

    // Convert to PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: report.pageSize || 'letter',
        landscape: report.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        }
      });

      return pdf;
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate HTML report
   */
  static async _generateHTML(report, data, parameters) {
    // Use custom template if provided
    let template = report.template;

    if (!template) {
      // Default template
      template = this._getDefaultHTMLTemplate(report.type);
    }

    // Compile with Handlebars
    const compiledTemplate = Handlebars.compile(template);

    // Prepare template data
    const templateData = {
      report: {
        name: report.name,
        description: report.description,
        generatedAt: new Date().toISOString()
      },
      parameters,
      data,
      // Helper functions
      formatDate: (date) => new Date(date).toLocaleDateString(),
      formatNumber: (num) => num.toLocaleString(),
      formatCurrency: (num) => `$${num.toFixed(2)}`
    };

    return compiledTemplate(templateData);
  }

  /**
   * Get default HTML template
   */
  static _getDefaultHTMLTemplate(type) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{report.name}}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .header { margin-bottom: 20px; }
    .meta { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{report.name}}</h1>
    <p>{{report.description}}</p>
    <p class="meta">Generated: {{report.generatedAt}}</p>
  </div>

  {{#if data}}
    {{#if data.length}}
      <table>
        <thead>
          <tr>
            {{#each data.[0]}}
              <th>{{@key}}</th>
            {{/each}}
          </tr>
        </thead>
        <tbody>
          {{#each data}}
            <tr>
              {{#each this}}
                <td>{{this}}</td>
              {{/each}}
            </tr>
          {{/each}}
        </tbody>
      </table>
    {{/if}}
  {{/if}}
</body>
</html>
    `;
  }

  /**
   * Generate Excel report
   */
  static async _generateExcel(report, data, parameters) {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Exprsn Pulse';
    workbook.created = new Date();

    // If data has multiple datasets
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const [sheetName, dataset] of Object.entries(data)) {
        this._addExcelSheet(workbook, sheetName, dataset, report);
      }
    } else {
      // Single dataset
      this._addExcelSheet(workbook, 'Report Data', data, report);
    }

    // Add metadata sheet
    const metaSheet = workbook.addWorksheet('Metadata');
    metaSheet.columns = [
      { header: 'Property', key: 'property', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ];

    metaSheet.addRow({ property: 'Report Name', value: report.name });
    metaSheet.addRow({ property: 'Description', value: report.description });
    metaSheet.addRow({ property: 'Generated At', value: new Date().toISOString() });
    metaSheet.addRow({ property: 'Parameters', value: JSON.stringify(parameters) });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Add sheet to Excel workbook
   */
  static _addExcelSheet(workbook, name, data, report) {
    const worksheet = workbook.addWorksheet(name);

    if (!data || data.length === 0) {
      worksheet.addRow(['No data available']);
      return;
    }

    // Add columns from first row
    const columns = Object.keys(data[0]).map(key => ({
      header: key,
      key,
      width: 20
    }));

    worksheet.columns = columns;

    // Add data
    data.forEach(row => worksheet.addRow(row));

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add borders
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(65 + columns.length - 1)}1`
    };
  }

  /**
   * Generate CSV report
   */
  static async _generateCSV(report, data) {
    // If multiple datasets, combine them
    let csvData = data;
    if (typeof data === 'object' && !Array.isArray(data)) {
      csvData = [];
      for (const [name, dataset] of Object.entries(data)) {
        csvData.push(...dataset.map(row => ({ dataset: name, ...row })));
      }
    }

    return stringify(csvData, {
      header: true,
      quoted: true
    });
  }

  /**
   * Update report statistics
   */
  static async _updateReportStats(report, executionTime) {
    const newAvg = report.executionCount === 0
      ? executionTime
      : (report.avgExecutionTime * report.executionCount + executionTime) / (report.executionCount + 1);

    await report.update({
      lastExecutedAt: new Date(),
      executionCount: report.executionCount + 1,
      avgExecutionTime: newAvg
    });
  }

  /**
   * List reports
   */
  static async list(filters = {}, pagination = {}) {
    const where = {};

    if (filters.category) where.category = filters.category;
    if (filters.type) where.type = filters.type;
    if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;
    if (filters.isTemplate !== undefined) where.isTemplate = filters.isTemplate;

    const options = {
      where,
      order: [[filters.orderBy || 'createdAt', filters.orderDirection || 'DESC']],
      include: filters.includeDetails
        ? [
            { model: ReportParameter, as: 'parameters' },
            { model: Filter, as: 'filters' }
          ]
        : []
    };

    if (pagination.limit) {
      options.limit = pagination.limit;
      options.offset = pagination.offset || 0;
    }

    const { rows, count } = await Report.findAndCountAll(options);

    return {
      reports: rows,
      total: count,
      page: pagination.offset ? Math.floor(pagination.offset / pagination.limit) + 1 : 1,
      pages: pagination.limit ? Math.ceil(count / pagination.limit) : 1
    };
  }

  /**
   * Update report
   */
  static async update(id, data, userId) {
    const report = await Report.findByPk(id);
    if (!report) {
      throw new Error('Report not found');
    }

    await report.update({
      ...data,
      updatedBy: userId
    });

    return report;
  }

  /**
   * Delete report
   */
  static async delete(id) {
    const report = await Report.findByPk(id);
    if (!report) {
      throw new Error('Report not found');
    }

    await report.destroy();
    logger.info('Report deleted', { reportId: id });
  }
}

module.exports = ReportService;
