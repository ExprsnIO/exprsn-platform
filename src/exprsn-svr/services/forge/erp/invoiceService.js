const { Invoice, Customer, Product, Payment } = require('../../../models/forge');
const { Op } = require('sequelize');
const logger = require('../../../utils/logger');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Invoice Service
 * Handles invoice creation, updates, payments, and PDF generation
 */

/**
 * Generate next invoice number
 * Format: INV-YYYY-NNNN
 */
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const lastInvoice = await Invoice.findOne({
    where: {
      invoiceNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastInvoice) {
    const lastNumber = lastInvoice.invoiceNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Calculate invoice totals from line items
 */
function calculateTotals(lineItems, taxRate = 0, discount = 0, shippingCost = 0) {
  let subtotal = 0;

  lineItems.forEach(item => {
    const itemTotal = item.quantity * item.unitPrice;
    const itemDiscount = item.discount || 0;
    const itemTax = item.taxAmount || 0;
    subtotal += itemTotal - itemDiscount + itemTax;
  });

  const discountAmount = discount;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRate / 100);
  const total = taxableAmount + taxAmount + shippingCost;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    shippingCost: parseFloat(shippingCost.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

/**
 * Create a new invoice
 */
async function createInvoice(data) {
  try {
    // Generate invoice number if not provided
    if (!data.invoiceNumber) {
      data.invoiceNumber = await generateInvoiceNumber();
    }

    // Calculate totals
    const totals = calculateTotals(
      data.lineItems || [],
      data.taxRate,
      data.discountAmount || 0,
      data.shippingCost || 0
    );

    // Create invoice
    const invoice = await Invoice.create({
      ...data,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      balanceDue: totals.total,
      status: data.status || 'draft'
    });

    logger.info('Invoice created', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      total: invoice.total
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to create invoice', { error: error.message });
    throw error;
  }
}

/**
 * Get invoice by ID with customer details
 */
async function getInvoiceById(id) {
  try {
    const invoice = await Invoice.findByPk(id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'customerName', 'email', 'phone', 'billingAddress']
        }
      ]
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return invoice;
  } catch (error) {
    logger.error('Failed to get invoice', { error: error.message, invoiceId: id });
    throw error;
  }
}

/**
 * List invoices with filters
 */
async function listInvoices(filters = {}) {
  try {
    const {
      customerId,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      overdue,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    if (minAmount || maxAmount) {
      where.total = {};
      if (minAmount) where.total[Op.gte] = minAmount;
      if (maxAmount) where.total[Op.lte] = maxAmount;
    }
    if (overdue) {
      where.dueDate = { [Op.lt]: new Date() };
      where.status = { [Op.notIn]: ['paid', 'cancelled', 'void'] };
      where.balanceDue = { [Op.gt]: 0 };
    }

    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'customerName', 'email']
        }
      ],
      order: [['invoiceDate', 'DESC']],
      limit,
      offset
    });

    return {
      invoices: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list invoices', { error: error.message });
    throw error;
  }
}

/**
 * Update invoice
 */
async function updateInvoice(id, updates) {
  try {
    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Prevent updates to posted/paid invoices
    if (['paid', 'void'].includes(invoice.status)) {
      throw new Error(`Cannot update invoice with status: ${invoice.status}`);
    }

    // Recalculate totals if line items changed
    if (updates.lineItems) {
      const totals = calculateTotals(
        updates.lineItems,
        updates.taxRate || invoice.taxRate,
        updates.discountAmount || invoice.discountAmount,
        updates.shippingCost || invoice.shippingCost
      );

      updates.subtotal = totals.subtotal;
      updates.taxAmount = totals.taxAmount;
      updates.total = totals.total;
      updates.balanceDue = totals.total - invoice.paidAmount;
    }

    await invoice.update(updates);

    logger.info('Invoice updated', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to update invoice', { error: error.message, invoiceId: id });
    throw error;
  }
}

/**
 * Delete invoice (soft delete by setting status to cancelled)
 */
async function deleteInvoice(id) {
  try {
    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Prevent deletion of paid invoices
    if (invoice.status === 'paid') {
      throw new Error('Cannot delete paid invoice');
    }

    await invoice.update({ status: 'cancelled' });

    logger.info('Invoice cancelled', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to delete invoice', { error: error.message, invoiceId: id });
    throw error;
  }
}

/**
 * Add line item to invoice
 */
async function addLineItem(invoiceId, item) {
  try {
    const invoice = await Invoice.findByPk(invoiceId);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (['paid', 'void'].includes(invoice.status)) {
      throw new Error(`Cannot modify invoice with status: ${invoice.status}`);
    }

    const lineItems = [...(invoice.lineItems || []), item];

    const totals = calculateTotals(
      lineItems,
      invoice.taxRate,
      invoice.discountAmount,
      invoice.shippingCost
    );

    await invoice.update({
      lineItems,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      balanceDue: totals.total - invoice.paidAmount
    });

    logger.info('Line item added to invoice', {
      invoiceId: invoice.id,
      lineItem: item
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to add line item', { error: error.message, invoiceId });
    throw error;
  }
}

/**
 * Remove line item from invoice
 */
async function removeLineItem(invoiceId, lineItemId) {
  try {
    const invoice = await Invoice.findByPk(invoiceId);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (['paid', 'void'].includes(invoice.status)) {
      throw new Error(`Cannot modify invoice with status: ${invoice.status}`);
    }

    const lineItems = (invoice.lineItems || []).filter(item => item.id !== lineItemId);

    const totals = calculateTotals(
      lineItems,
      invoice.taxRate,
      invoice.discountAmount,
      invoice.shippingCost
    );

    await invoice.update({
      lineItems,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      balanceDue: totals.total - invoice.paidAmount
    });

    logger.info('Line item removed from invoice', {
      invoiceId: invoice.id,
      lineItemId
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to remove line item', { error: error.message, invoiceId });
    throw error;
  }
}

/**
 * Send invoice via email (stub - integrate with Herald notification service)
 */
async function sendInvoice(invoiceId, emailOptions = {}) {
  try {
    const invoice = await getInvoiceById(invoiceId);

    if (invoice.status === 'draft') {
      throw new Error('Cannot send draft invoice');
    }

    // TODO: Integrate with exprsn-herald notification service
    // For now, just log the action

    await invoice.update({
      status: 'sent',
      sentAt: new Date()
    });

    logger.info('Invoice sent', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerEmail: invoice.customer.email
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to send invoice', { error: error.message, invoiceId });
    throw error;
  }
}

/**
 * Record payment on invoice
 */
async function recordPayment(invoiceId, paymentData) {
  try {
    const invoice = await Invoice.findByPk(invoiceId);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'void') {
      throw new Error('Cannot record payment on void invoice');
    }

    const paymentAmount = parseFloat(paymentData.amount);

    if (paymentAmount > invoice.balanceDue) {
      throw new Error('Payment amount exceeds balance due');
    }

    // Update invoice
    const paidAmount = invoice.paidAmount + paymentAmount;
    const balanceDue = invoice.total - paidAmount;
    const status = balanceDue === 0 ? 'paid' : 'partial';

    await invoice.update({
      paidAmount,
      balanceDue,
      status,
      lastPaymentDate: paymentData.paymentDate || new Date()
    });

    logger.info('Payment recorded on invoice', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentAmount,
      balanceDue
    });

    return invoice;
  } catch (error) {
    logger.error('Failed to record payment', { error: error.message, invoiceId });
    throw error;
  }
}

/**
 * Generate PDF invoice
 */
async function generatePDF(invoiceId) {
  try {
    const invoice = await getInvoiceById(invoiceId);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
        const filePath = path.join(__dirname, '../../../temp', fileName);

        // Ensure temp directory exists
        const tempDir = path.dirname(filePath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc
          .fontSize(20)
          .text('INVOICE', 50, 50);

        doc
          .fontSize(10)
          .text(`Invoice #: ${invoice.invoiceNumber}`, 50, 80)
          .text(`Date: ${invoice.invoiceDate.toLocaleDateString()}`, 50, 95)
          .text(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, 50, 110);

        // Customer Info
        doc
          .fontSize(12)
          .text('Bill To:', 50, 150)
          .fontSize(10)
          .text(invoice.customer.customerName, 50, 170)
          .text(invoice.customer.billingAddress || '', 50, 185);

        // Line Items Table
        let y = 250;
        doc
          .fontSize(10)
          .text('Description', 50, y)
          .text('Quantity', 250, y)
          .text('Unit Price', 320, y)
          .text('Amount', 420, y);

        y += 20;
        doc
          .moveTo(50, y)
          .lineTo(550, y)
          .stroke();

        y += 10;

        invoice.lineItems.forEach(item => {
          const amount = item.quantity * item.unitPrice;
          doc
            .text(item.description, 50, y, { width: 180 })
            .text(item.quantity.toString(), 250, y)
            .text(`$${item.unitPrice.toFixed(2)}`, 320, y)
            .text(`$${amount.toFixed(2)}`, 420, y);
          y += 25;
        });

        // Totals
        y += 20;
        doc
          .text('Subtotal:', 350, y)
          .text(`$${invoice.subtotal.toFixed(2)}`, 420, y);

        y += 20;
        if (invoice.discountAmount > 0) {
          doc
            .text('Discount:', 350, y)
            .text(`-$${invoice.discountAmount.toFixed(2)}`, 420, y);
          y += 20;
        }

        if (invoice.taxAmount > 0) {
          doc
            .text(`Tax (${invoice.taxRate}%):`, 350, y)
            .text(`$${invoice.taxAmount.toFixed(2)}`, 420, y);
          y += 20;
        }

        if (invoice.shippingCost > 0) {
          doc
            .text('Shipping:', 350, y)
            .text(`$${invoice.shippingCost.toFixed(2)}`, 420, y);
          y += 20;
        }

        doc
          .fontSize(12)
          .text('Total:', 350, y)
          .text(`$${invoice.total.toFixed(2)}`, 420, y);

        y += 20;
        if (invoice.paidAmount > 0) {
          doc
            .fontSize(10)
            .text('Paid:', 350, y)
            .text(`-$${invoice.paidAmount.toFixed(2)}`, 420, y);
          y += 20;
        }

        doc
          .fontSize(12)
          .text('Balance Due:', 350, y)
          .text(`$${invoice.balanceDue.toFixed(2)}`, 420, y);

        // Notes
        if (invoice.notes) {
          y += 40;
          doc
            .fontSize(10)
            .text('Notes:', 50, y)
            .text(invoice.notes, 50, y + 15, { width: 500 });
        }

        doc.end();

        stream.on('finish', () => {
          logger.info('PDF invoice generated', {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            filePath
          });
          resolve(filePath);
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  } catch (error) {
    logger.error('Failed to generate PDF', { error: error.message, invoiceId });
    throw error;
  }
}

/**
 * Mark overdue invoices
 * Should be run as a cron job
 */
async function markOverdue() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Invoice.update(
      { status: 'overdue' },
      {
        where: {
          dueDate: { [Op.lt]: today },
          status: { [Op.in]: ['sent', 'partial'] },
          balanceDue: { [Op.gt]: 0 }
        }
      }
    );

    logger.info('Marked overdue invoices', { count: result[0] });
    return result[0];
  } catch (error) {
    logger.error('Failed to mark overdue invoices', { error: error.message });
    throw error;
  }
}

/**
 * Get invoice statistics
 */
async function getInvoiceStatistics(customerId = null) {
  try {
    const where = customerId ? { customerId } : {};

    const [
      totalInvoices,
      totalAmount,
      totalPaid,
      totalOverdue
    ] = await Promise.all([
      Invoice.count({ where }),
      Invoice.sum('total', { where }),
      Invoice.sum('paidAmount', { where }),
      Invoice.sum('balanceDue', {
        where: {
          ...where,
          status: 'overdue'
        }
      })
    ]);

    return {
      totalInvoices: totalInvoices || 0,
      totalAmount: totalAmount || 0,
      totalPaid: totalPaid || 0,
      totalOutstanding: (totalAmount || 0) - (totalPaid || 0),
      totalOverdue: totalOverdue || 0
    };
  } catch (error) {
    logger.error('Failed to get invoice statistics', { error: error.message });
    throw error;
  }
}

module.exports = {
  generateInvoiceNumber,
  calculateTotals,
  createInvoice,
  getInvoiceById,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  addLineItem,
  removeLineItem,
  sendInvoice,
  recordPayment,
  generatePDF,
  markOverdue,
  getInvoiceStatistics
};
