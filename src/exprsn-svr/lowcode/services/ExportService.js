/**
 * ExportService - Export report data to various formats (CSV, Excel, PDF)
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

class ExportService {
  /**
   * Export report data to CSV format
   */
  static exportToCSV(data, reportName = 'report') {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: 'INVALID_DATA',
        message: 'Data must be a non-empty array'
      };
    }

    try {
      // Get column headers from first row
      const headers = Object.keys(data[0]);

      // Build CSV content
      let csv = headers.map(h => this.escapeCSV(h)).join(',') + '\n';

      // Add data rows
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return this.escapeCSV(value);
        });
        csv += values.join(',') + '\n';
      });

      return {
        success: true,
        data: csv,
        filename: `${reportName}_${this.getTimestamp()}.csv`,
        contentType: 'text/csv',
        encoding: 'utf8'
      };
    } catch (error) {
      console.error('[ExportService] CSV export failed:', error);
      return {
        success: false,
        error: 'EXPORT_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Export report data to Excel format
   */
  static async exportToExcel(data, reportName = 'report', options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: 'INVALID_DATA',
        message: 'Data must be a non-empty array'
      };
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(options.sheetName || 'Report Data');

      // Get column headers
      const headers = Object.keys(data[0]);

      // Define columns with headers
      worksheet.columns = headers.map(header => ({
        header: header,
        key: header,
        width: 15
      }));

      // Style the header row
      worksheet.getRow(1).font = { bold: true, size: 11 };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0078D4' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

      // Add data rows
      data.forEach(row => {
        worksheet.addRow(row);
      });

      // Auto-fit columns based on content
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? String(cell.value).length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Add filters to header row
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length }
      };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      return {
        success: true,
        data: buffer,
        filename: `${reportName}_${this.getTimestamp()}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
    } catch (error) {
      console.error('[ExportService] Excel export failed:', error);
      return {
        success: false,
        error: 'EXPORT_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Export report data to PDF format
   */
  static async exportToPDF(data, reportName = 'report', options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        error: 'INVALID_DATA',
        message: 'Data must be a non-empty array'
      };
    }

    try {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margin: 50
        });

        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            success: true,
            data: buffer,
            filename: `${reportName}_${this.getTimestamp()}.pdf`,
            contentType: 'application/pdf'
          });
        });
        doc.on('error', reject);

        // Add title
        doc.fontSize(18)
           .font('Helvetica-Bold')
           .text(options.title || reportName, { align: 'center' });

        doc.moveDown();

        // Add metadata
        if (options.description) {
          doc.fontSize(10)
             .font('Helvetica')
             .text(options.description, { align: 'left' });
          doc.moveDown();
        }

        doc.fontSize(8)
           .font('Helvetica')
           .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });

        doc.moveDown(2);

        // Get headers
        const headers = Object.keys(data[0]);
        const columnWidth = (doc.page.width - 100) / headers.length;

        // Draw table header
        doc.fontSize(9).font('Helvetica-Bold');
        let y = doc.y;
        headers.forEach((header, i) => {
          doc.rect(50 + i * columnWidth, y, columnWidth, 25)
             .fillAndStroke('#0078D4', '#000000');

          doc.fillColor('#FFFFFF')
             .text(header, 55 + i * columnWidth, y + 7, {
               width: columnWidth - 10,
               align: 'left',
               lineBreak: false,
               ellipsis: true
             });
        });

        doc.fillColor('#000000').font('Helvetica');
        y += 25;

        // Draw table rows
        const rowsPerPage = Math.floor((doc.page.height - y - 50) / 20);

        data.forEach((row, rowIndex) => {
          if (rowIndex > 0 && rowIndex % rowsPerPage === 0) {
            doc.addPage();
            y = 50;
          }

          // Alternate row colors
          if (rowIndex % 2 === 0) {
            doc.rect(50, y, doc.page.width - 100, 20)
               .fill('#F5F5F5');
          }

          headers.forEach((header, colIndex) => {
            const value = row[header] !== null && row[header] !== undefined
              ? String(row[header])
              : '';

            doc.fillColor('#000000')
               .fontSize(8)
               .text(value, 55 + colIndex * columnWidth, y + 5, {
                 width: columnWidth - 10,
                 align: 'left',
                 lineBreak: false,
                 ellipsis: true
               });
          });

          y += 20;
        });

        // Add footer with page numbers
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
             .text(
               `Page ${i + 1} of ${pages.count}`,
               50,
               doc.page.height - 30,
               { align: 'center' }
             );
        }

        doc.end();
      });
    } catch (error) {
      console.error('[ExportService] PDF export failed:', error);
      return {
        success: false,
        error: 'EXPORT_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Helper: Escape CSV values
   */
  static escapeCSV(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Helper: Get timestamp for filenames
   */
  static getTimestamp() {
    const now = new Date();
    return now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace('T', '_');
  }

  /**
   * Export report with auto-format detection
   */
  static async exportReport(data, format, reportName, options = {}) {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV(data, reportName);

      case 'excel':
      case 'xlsx':
        return await this.exportToExcel(data, reportName, options);

      case 'pdf':
        return await this.exportToPDF(data, reportName, options);

      default:
        return {
          success: false,
          error: 'INVALID_FORMAT',
          message: `Unsupported format: ${format}. Supported formats: csv, excel, pdf`
        };
    }
  }
}

module.exports = ExportService;
