const PDFDocument = require('pdfkit');
const { logger } = require('@exprsn/shared');

class PDFGenerator {
  /**
   * Generate invoice PDF
   */
  async generateInvoicePDF(invoice) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
        const chunks = [];

        // Collect PDF data
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        this.generateHeader(doc, invoice);

        // Invoice details
        this.generateInvoiceDetails(doc, invoice);

        // Customer information
        this.generateCustomerInfo(doc, invoice);

        // Line items table
        this.generateLineItems(doc, invoice);

        // Totals
        this.generateTotals(doc, invoice);

        // Footer
        this.generateFooter(doc, invoice);

        // Finalize PDF
        doc.end();
      } catch (error) {
        logger.error('PDF generation error', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Generate header section
   */
  generateHeader(doc, invoice) {
    doc
      .fontSize(20)
      .text('INVOICE', 50, 50, { align: 'left' })
      .fontSize(10)
      .text('Exprsn Platform', 400, 50, { align: 'right' })
      .text('123 Business St', 400, 65, { align: 'right' })
      .text('San Francisco, CA 94102', 400, 80, { align: 'right' })
      .text('support@exprsn.io', 400, 95, { align: 'right' })
      .moveDown();
  }

  /**
   * Generate invoice details
   */
  generateInvoiceDetails(doc, invoice) {
    const detailsTop = 130;

    doc
      .fontSize(10)
      .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, detailsTop)
      .text(`Invoice Date: ${this.formatDate(invoice.createdAt)}`, 50, detailsTop + 15)
      .text(`Due Date: ${this.formatDate(invoice.dueDate)}`, 50, detailsTop + 30);

    if (invoice.status === 'paid') {
      doc.text(`Paid Date: ${this.formatDate(invoice.paidAt)}`, 50, detailsTop + 45);
    }

    // Status badge
    const statusX = 450;
    const statusY = detailsTop;
    const statusColor = this.getStatusColor(invoice.status);

    doc
      .roundedRect(statusX, statusY, 100, 25, 3)
      .fillAndStroke(statusColor, statusColor)
      .fillColor('#FFFFFF')
      .fontSize(12)
      .text(invoice.status.toUpperCase(), statusX, statusY + 7, {
        width: 100,
        align: 'center'
      })
      .fillColor('#000000');
  }

  /**
   * Generate customer information
   */
  generateCustomerInfo(doc, invoice) {
    const customerTop = 210;

    doc
      .fontSize(12)
      .text('Bill To:', 50, customerTop)
      .fontSize(10)
      .text(invoice.customer.name || `${invoice.customer.firstName} ${invoice.customer.lastName}`, 50, customerTop + 20)
      .text(invoice.customer.email, 50, customerTop + 35);

    if (invoice.customer.address) {
      doc.text(invoice.customer.address, 50, customerTop + 50);
    }

    // Description if provided
    if (invoice.description) {
      doc
        .fontSize(10)
        .text('Description:', 300, customerTop)
        .fontSize(9)
        .text(invoice.description, 300, customerTop + 20, { width: 250 });
    }

    doc.moveDown();
  }

  /**
   * Generate line items table
   */
  generateLineItems(doc, invoice) {
    const tableTop = 320;
    const itemCodeX = 50;
    const descriptionX = 150;
    const quantityX = 350;
    const priceX = 410;
    const totalX = 480;

    // Table header
    doc
      .fontSize(10)
      .fillColor('#333333');

    this.generateTableRow(
      doc,
      tableTop,
      'Item',
      'Description',
      'Qty',
      'Unit Price',
      'Total',
      true
    );

    // Header line
    doc
      .strokeColor('#CCCCCC')
      .lineWidth(1)
      .moveTo(50, tableTop + 20)
      .lineTo(550, tableTop + 20)
      .stroke();

    // Line items
    let position = tableTop + 30;
    doc.fontSize(9).fillColor('#000000');

    invoice.lineItems.forEach((item, index) => {
      this.generateTableRow(
        doc,
        position,
        (index + 1).toString(),
        item.description || item.name || 'Item',
        item.quantity.toString(),
        this.formatCurrency(item.unitPrice || (item.total / item.quantity), invoice.currency),
        this.formatCurrency(item.total || (item.quantity * item.unitPrice), invoice.currency)
      );

      position += 25;
    });

    return position;
  }

  /**
   * Generate table row
   */
  generateTableRow(doc, y, item, description, quantity, price, total, isHeader = false) {
    const itemX = 50;
    const descriptionX = 100;
    const quantityX = 350;
    const priceX = 410;
    const totalX = 480;

    if (isHeader) {
      doc.font('Helvetica-Bold');
    } else {
      doc.font('Helvetica');
    }

    doc
      .text(item, itemX, y, { width: 40, align: 'left' })
      .text(description, descriptionX, y, { width: 240 })
      .text(quantity, quantityX, y, { width: 50, align: 'right' })
      .text(price, priceX, y, { width: 60, align: 'right' })
      .text(total, totalX, y, { width: 70, align: 'right' });

    doc.font('Helvetica');
  }

  /**
   * Generate totals section
   */
  generateTotals(doc, invoice) {
    const totalsTop = 500;
    const labelX = 400;
    const amountX = 480;

    doc
      .fontSize(10)
      .text('Subtotal:', labelX, totalsTop, { align: 'left' })
      .text(this.formatCurrency(invoice.subtotal, invoice.currency), amountX, totalsTop, { width: 70, align: 'right' });

    if (invoice.discount > 0) {
      doc
        .text('Discount:', labelX, totalsTop + 20, { align: 'left' })
        .text(`-${this.formatCurrency(invoice.discount, invoice.currency)}`, amountX, totalsTop + 20, { width: 70, align: 'right' });
    }

    if (invoice.tax > 0) {
      doc
        .text('Tax:', labelX, totalsTop + 40, { align: 'left' })
        .text(this.formatCurrency(invoice.tax, invoice.currency), amountX, totalsTop + 40, { width: 70, align: 'right' });
    }

    // Total line
    doc
      .strokeColor('#000000')
      .lineWidth(1)
      .moveTo(labelX, totalsTop + 60)
      .lineTo(550, totalsTop + 60)
      .stroke();

    // Total amount
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Total:', labelX, totalsTop + 70, { align: 'left' })
      .text(this.formatCurrency(invoice.total, invoice.currency), amountX, totalsTop + 70, { width: 70, align: 'right' });

    if (invoice.amountPaid > 0) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .text('Amount Paid:', labelX, totalsTop + 100, { align: 'left' })
        .text(this.formatCurrency(invoice.amountPaid, invoice.currency), amountX, totalsTop + 100, { width: 70, align: 'right' });
    }

    if (invoice.amountDue > 0) {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#D32F2F')
        .text('Amount Due:', labelX, totalsTop + 120, { align: 'left' })
        .text(this.formatCurrency(invoice.amountDue, invoice.currency), amountX, totalsTop + 120, { width: 70, align: 'right' })
        .fillColor('#000000');
    }

    doc.font('Helvetica');
  }

  /**
   * Generate footer section
   */
  generateFooter(doc, invoice) {
    const footerTop = 680;

    doc
      .fontSize(8)
      .fillColor('#666666')
      .text(
        'Thank you for your business!',
        50,
        footerTop,
        { align: 'center', width: 500 }
      )
      .text(
        'For questions about this invoice, please contact support@exprsn.io',
        50,
        footerTop + 15,
        { align: 'center', width: 500 }
      )
      .fillColor('#000000');

    // Invoice ID footer (for reference)
    doc
      .fontSize(7)
      .fillColor('#999999')
      .text(
        `Invoice ID: ${invoice.id}`,
        50,
        720,
        { align: 'center', width: 500 }
      )
      .fillColor('#000000');
  }

  /**
   * Format date
   */
  formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format currency
   */
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Get status color
   */
  getStatusColor(status) {
    const colors = {
      draft: '#9E9E9E',
      open: '#2196F3',
      paid: '#4CAF50',
      void: '#F44336',
      uncollectible: '#FF9800'
    };

    return colors[status] || '#9E9E9E';
  }
}

module.exports = new PDFGenerator();
