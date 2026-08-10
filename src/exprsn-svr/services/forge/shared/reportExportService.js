/**
 * Report Export Service
 * Handles exporting reports to various formats (PDF, Excel, CSV)
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { stringify } = require('csv-stringify/sync');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../utils/logger');

class ReportExportService {
  constructor() {
    this.exportDir = process.env.REPORT_EXPORT_DIR || '/tmp/forge/reports';
    this.urlBase = process.env.REPORT_EXPORT_URL_BASE || '/api/reports/exports';
  }

  /**
   * Export report to specified format
   */
  async exportReport(report, result, format, options = {}) {
    try {
      // Ensure export directory exists
      await this.ensureDirectoryExists();

      let exportPath;
      let exportUrl;

      switch (format.toLowerCase()) {
        case 'pdf':
          ({ exportPath, exportUrl } = await this.exportToPDF(report, result, options));
          break;
        case 'excel':
        case 'xlsx':
          ({ exportPath, exportUrl } = await this.exportToExcel(report, result, options));
          break;
        case 'csv':
          ({ exportPath, exportUrl } = await this.exportToCSV(report, result, options));
          break;
        case 'json':
          ({ exportPath, exportUrl } = await this.exportToJSON(report, result, options));
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      logger.info('Report exported', {
        reportId: report.id,
        format,
        path: exportPath
      });

      return {
        exportPath,
        exportUrl,
        format,
        expiresAt: this.getExpirationDate()
      };

    } catch (error) {
      logger.error('Report export failed', {
        reportId: report.id,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export to PDF
   */
  async exportToPDF(report, result, options) {
    const filename = this.generateFilename(report, 'pdf');
    const exportPath = path.join(this.exportDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const stream = require('fs').createWriteStream(exportPath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text(report.name, { align: 'center' });
        doc.moveDown(0.5);

        if (report.description) {
          doc.fontSize(10).fillColor('#666666')
            .text(report.description, { align: 'center' });
          doc.moveDown(0.5);
        }

        doc.fontSize(9).fillColor('#999999')
          .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(1.5);

        // Reset color and font for content
        doc.fillColor('#000000').fontSize(10);

        // Handle different result structures
        if (result.data && Array.isArray(result.data)) {
          this.renderTableToPDF(doc, result.data);
        } else if (typeof result === 'object') {
          this.renderObjectToPDF(doc, result);
        }

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).fillColor('#999999')
            .text(
              `Page ${i + 1} of ${pageCount}`,
              50,
              doc.page.height - 50,
              { align: 'center' }
            );
        }

        doc.end();

        stream.on('finish', () => {
          resolve({
            exportPath,
            exportUrl: `${this.urlBase}/${filename}`
          });
        });

        stream.on('error', reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Render table data to PDF
   */
  renderTableToPDF(doc, data) {
    if (!data || data.length === 0) {
      doc.text('No data available', { align: 'center' });
      return;
    }

    const headers = Object.keys(data[0]);
    const columnWidth = (doc.page.width - 100) / headers.length;

    // Table header
    let y = doc.y;
    doc.fontSize(9).fillColor('#000000');

    headers.forEach((header, i) => {
      doc.text(header, 50 + (i * columnWidth), y, {
        width: columnWidth,
        continued: i < headers.length - 1
      });
    });

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.5);

    // Table rows
    doc.fontSize(8).fillColor('#333333');

    data.forEach((row, rowIndex) => {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      y = doc.y;
      headers.forEach((header, i) => {
        const value = row[header] !== null && row[header] !== undefined
          ? row[header].toString()
          : '';

        doc.text(value, 50 + (i * columnWidth), y, {
          width: columnWidth - 5,
          height: 20,
          ellipsis: true,
          continued: i < headers.length - 1
        });
      });

      doc.moveDown(0.3);

      // Alternate row background (light gray)
      if (rowIndex % 2 === 1) {
        doc.rect(50, y - 2, doc.page.width - 100, 15)
          .fillOpacity(0.05)
          .fill('#000000')
          .fillOpacity(1);
      }
    });
  }

  /**
   * Render object/hierarchical data to PDF
   */
  renderObjectToPDF(doc, obj, indent = 0) {
    for (const [key, value] of Object.entries(obj)) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        doc.fontSize(11).fillColor('#000000')
          .text(`${' '.repeat(indent * 2)}${key}:`, { continued: false });
        doc.moveDown(0.3);
        this.renderObjectToPDF(doc, value, indent + 1);
      } else if (Array.isArray(value)) {
        doc.fontSize(10).fillColor('#000000')
          .text(`${' '.repeat(indent * 2)}${key}: [${value.length} items]`);
        doc.moveDown(0.3);
      } else {
        doc.fontSize(9).fillColor('#333333')
          .text(`${' '.repeat(indent * 2)}${key}: ${value}`);
        doc.moveDown(0.2);
      }
    }
  }

  /**
   * Export to Excel
   */
  async exportToExcel(report, result, options) {
    const filename = this.generateFilename(report, 'xlsx');
    const exportPath = path.join(this.exportDir, filename);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Exprsn Forge';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(report.name.substring(0, 31)); // Excel sheet name limit

    // Add report metadata
    worksheet.getCell('A1').value = report.name;
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A2').value = report.description;
    worksheet.getCell('A3').value = `Generated: ${new Date().toLocaleString()}`;
    worksheet.getCell('A3').font = { size: 9, color: { argb: 'FF666666' } };

    // Add data
    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const headers = Object.keys(result.data[0]);

      // Add headers (row 5)
      worksheet.getRow(5).values = headers;
      worksheet.getRow(5).font = { bold: true };
      worksheet.getRow(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      result.data.forEach((row, index) => {
        const rowValues = headers.map(header => row[header]);
        worksheet.getRow(6 + index).values = rowValues;
      });

      // Auto-fit columns
      worksheet.columns.forEach((column, index) => {
        let maxLength = headers[index].length;
        result.data.forEach(row => {
          const value = row[headers[index]];
          const length = value ? value.toString().length : 0;
          if (length > maxLength) maxLength = length;
        });
        column.width = Math.min(maxLength + 2, 50);
      });
    }

    await workbook.xlsx.writeFile(exportPath);

    return {
      exportPath,
      exportUrl: `${this.urlBase}/${filename}`
    };
  }

  /**
   * Export to CSV
   */
  async exportToCSV(report, result, options) {
    const filename = this.generateFilename(report, 'csv');
    const exportPath = path.join(this.exportDir, filename);

    let csvContent = '';

    // Add metadata as comments
    csvContent += `# ${report.name}\n`;
    if (report.description) {
      csvContent += `# ${report.description}\n`;
    }
    csvContent += `# Generated: ${new Date().toISOString()}\n\n`;

    // Add data
    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const csv = stringify(result.data, {
        header: true,
        quoted: true,
        quoted_empty: true
      });
      csvContent += csv;
    }

    await fs.writeFile(exportPath, csvContent, 'utf-8');

    return {
      exportPath,
      exportUrl: `${this.urlBase}/${filename}`
    };
  }

  /**
   * Export to JSON
   */
  async exportToJSON(report, result, options) {
    const filename = this.generateFilename(report, 'json');
    const exportPath = path.join(this.exportDir, filename);

    const jsonData = {
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        reportType: report.reportType,
        generatedAt: new Date().toISOString()
      },
      result
    };

    await fs.writeFile(
      exportPath,
      JSON.stringify(jsonData, null, 2),
      'utf-8'
    );

    return {
      exportPath,
      exportUrl: `${this.urlBase}/${filename}`
    };
  }

  /**
   * Generate unique filename
   */
  generateFilename(report, extension) {
    const timestamp = Date.now();
    const reportName = report.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return `${reportName}-${timestamp}.${extension}`;
  }

  /**
   * Ensure export directory exists
   */
  async ensureDirectoryExists() {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get expiration date for exported files (24 hours from now)
   */
  getExpirationDate() {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    return expiresAt;
  }

  /**
   * Clean up expired exports
   */
  async cleanupExpiredExports() {
    try {
      const files = await fs.readdir(this.exportDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(this.exportDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deleted++;
        }
      }

      if (deleted > 0) {
        logger.info('Cleaned up expired exports', { deleted });
      }

      return deleted;

    } catch (error) {
      logger.error('Export cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get export file
   */
  async getExportFile(filename) {
    const filePath = path.join(this.exportDir, filename);

    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      throw new Error('Export file not found or expired');
    }
  }
}

module.exports = new ReportExportService();
