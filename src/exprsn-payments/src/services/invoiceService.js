const { Invoice, Customer, Subscription, Transaction } = require('../models');
const { logger } = require('@exprsn/shared');
const pdfGenerator = require('./pdfGenerator');

class InvoiceService {
  /**
   * Generate invoice number
   * Format: INV-YYYY-####
   */
  async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Find the latest invoice for this year
    const latestInvoice = await Invoice.findOne({
      where: {
        invoiceNumber: {
          [require('sequelize').Op.like]: `${prefix}%`
        }
      },
      order: [['createdAt', 'DESC']]
    });

    let sequence = 1;
    if (latestInvoice) {
      const lastNumber = latestInvoice.invoiceNumber.split('-').pop();
      sequence = parseInt(lastNumber) + 1;
    }

    // Pad with zeros (4 digits)
    const paddedSequence = sequence.toString().padStart(4, '0');
    return `${prefix}${paddedSequence}`;
  }

  /**
   * Create invoice
   */
  async createInvoice({
    customerId,
    subscriptionId = null,
    provider,
    lineItems = [],
    description = null,
    dueDate = null,
    metadata = {}
  }) {
    try {
      const customer = await Customer.findByPk(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Calculate totals from line items
      const subtotal = lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unitPrice);
      }, 0);

      // Calculate tax (default 0, can be customized)
      const tax = metadata.taxRate ? subtotal * (metadata.taxRate / 100) : 0;

      // Calculate discount
      const discount = metadata.discountAmount || 0;

      // Calculate total
      const total = subtotal + tax - discount;
      const amountDue = total;

      // Set default due date (30 days from now)
      if (!dueDate) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        dueDate = thirtyDaysFromNow;
      }

      // Create invoice
      const invoice = await Invoice.create({
        invoiceNumber,
        customerId,
        subscriptionId,
        provider,
        status: 'open',
        subtotal,
        tax,
        discount,
        total,
        amountPaid: 0,
        amountDue,
        currency: metadata.currency || 'USD',
        description,
        lineItems,
        dueDate,
        metadata
      });

      logger.info('Invoice created', {
        invoiceId: invoice.id,
        invoiceNumber,
        customerId,
        total
      });

      // Generate PDF asynchronously
      this.generatePDF(invoice.id).catch(error => {
        logger.error('PDF generation failed', { invoiceId: invoice.id, error: error.message });
      });

      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice', { error: error.message, customerId });
      throw error;
    }
  }

  /**
   * Create invoice from subscription
   */
  async createInvoiceFromSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findByPk(subscriptionId, {
        include: [{ model: Customer, as: 'customer' }]
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const lineItems = [{
        description: `Subscription - ${subscription.planId}`,
        quantity: subscription.quantity,
        unitPrice: subscription.amount / subscription.quantity,
        total: subscription.amount
      }];

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days

      const invoice = await this.createInvoice({
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        provider: subscription.provider,
        lineItems,
        description: `Subscription renewal - ${subscription.planId}`,
        dueDate,
        metadata: {
          subscriptionId: subscription.id,
          billingCycle: subscription.billingCycle,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd
        }
      });

      return invoice;
    } catch (error) {
      logger.error('Failed to create subscription invoice', { error: error.message, subscriptionId });
      throw error;
    }
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId) {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Subscription, as: 'subscription' },
        { model: Transaction, as: 'payments' }
      ]
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    return invoice;
  }

  /**
   * List invoices
   */
  async listInvoices({ customerId = null, status = null, limit = 20, offset = 0 } = {}) {
    const where = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = status;
    }

    const invoices = await Invoice.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Customer, as: 'customer' },
        { model: Subscription, as: 'subscription' }
      ]
    });

    return invoices;
  }

  /**
   * Mark invoice as paid
   */
  async markAsPaid(invoiceId, { transactionId = null, paidAmount = null, paidAt = null } = {}) {
    try {
      const invoice = await Invoice.findByPk(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'paid') {
        throw new Error('Invoice is already paid');
      }

      const amount = paidAmount || invoice.amountDue;
      const paymentDate = paidAt || new Date();

      await invoice.update({
        status: 'paid',
        amountPaid: invoice.amountPaid + amount,
        amountDue: invoice.amountDue - amount,
        paidAt: paymentDate
      });

      logger.info('Invoice marked as paid', {
        invoiceId,
        transactionId,
        amount
      });

      // Send receipt email (TODO: integrate with exprsn-herald)
      this.sendReceipt(invoice.id).catch(error => {
        logger.error('Failed to send receipt', { invoiceId, error: error.message });
      });

      return invoice;
    } catch (error) {
      logger.error('Failed to mark invoice as paid', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Void invoice
   */
  async voidInvoice(invoiceId, reason = null) {
    try {
      const invoice = await Invoice.findByPk(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'paid') {
        throw new Error('Cannot void a paid invoice. Issue a refund instead.');
      }

      if (invoice.status === 'void') {
        throw new Error('Invoice is already void');
      }

      await invoice.update({
        status: 'void',
        voidedAt: new Date(),
        metadata: {
          ...invoice.metadata,
          voidReason: reason
        }
      });

      logger.info('Invoice voided', { invoiceId, reason });

      return invoice;
    } catch (error) {
      logger.error('Failed to void invoice', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Generate PDF for invoice
   */
  async generatePDF(invoiceId) {
    try {
      const invoice = await this.getInvoice(invoiceId);

      // Generate PDF
      const pdfBuffer = await pdfGenerator.generateInvoicePDF(invoice);

      // TODO: Upload to S3 or FileVault
      // For now, we'll store a placeholder URL
      const pdfUrl = `/api/invoices/${invoiceId}/pdf`;

      await invoice.update({ pdfUrl });

      logger.info('PDF generated for invoice', { invoiceId, pdfUrl });

      return pdfUrl;
    } catch (error) {
      logger.error('Failed to generate PDF', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Send invoice via email
   */
  async sendInvoice(invoiceId, { to = null, cc = [], bcc = [] } = {}) {
    try {
      const invoice = await this.getInvoice(invoiceId);

      // Use customer email if not specified
      const recipientEmail = to || invoice.customer.email;

      // Ensure PDF is generated
      if (!invoice.pdfUrl) {
        await this.generatePDF(invoiceId);
      }

      // TODO: Integration with exprsn-herald for email sending
      // For now, just log
      logger.info('Invoice send requested', {
        invoiceId,
        to: recipientEmail,
        cc,
        bcc,
        pdfUrl: invoice.pdfUrl
      });

      await invoice.update({
        sentAt: new Date()
      });

      return {
        success: true,
        message: 'Invoice sent successfully',
        sentTo: recipientEmail
      };
    } catch (error) {
      logger.error('Failed to send invoice', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Send receipt email
   */
  async sendReceipt(invoiceId) {
    try {
      const invoice = await this.getInvoice(invoiceId);

      if (invoice.status !== 'paid') {
        throw new Error('Cannot send receipt for unpaid invoice');
      }

      // TODO: Integration with exprsn-herald
      logger.info('Receipt send requested', {
        invoiceId,
        to: invoice.customer.email
      });

      return {
        success: true,
        message: 'Receipt sent successfully'
      };
    } catch (error) {
      logger.error('Failed to send receipt', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Get upcoming invoices (for subscriptions)
   */
  async getUpcomingInvoices(customerId) {
    try {
      // Get active subscriptions
      const subscriptions = await Subscription.findAll({
        where: {
          customerId,
          status: 'active'
        }
      });

      const upcomingInvoices = subscriptions.map(subscription => ({
        subscriptionId: subscription.id,
        planId: subscription.planId,
        amount: subscription.amount,
        currency: subscription.currency,
        nextBillingDate: subscription.currentPeriodEnd,
        lineItems: [{
          description: `Subscription - ${subscription.planId}`,
          quantity: subscription.quantity,
          unitPrice: subscription.amount / subscription.quantity,
          total: subscription.amount
        }]
      }));

      return upcomingInvoices;
    } catch (error) {
      logger.error('Failed to get upcoming invoices', { error: error.message, customerId });
      throw error;
    }
  }

  /**
   * Get invoice statistics
   */
  async getInvoiceStats(customerId = null) {
    try {
      const where = customerId ? { customerId } : {};

      const stats = await Invoice.findAll({
        where,
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'totalCount'],
          [require('sequelize').fn('SUM', require('sequelize').col('total')), 'totalAmount'],
          [require('sequelize').fn('SUM', require('sequelize').col('amount_paid')), 'totalPaid'],
          [require('sequelize').fn('SUM', require('sequelize').col('amount_due')), 'totalDue']
        ],
        group: ['status'],
        raw: true
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get invoice stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Process overdue invoices
   */
  async processOverdueInvoices() {
    try {
      const overdueInvoices = await Invoice.findAll({
        where: {
          status: 'open',
          dueDate: {
            [require('sequelize').Op.lt]: new Date()
          }
        },
        include: [{ model: Customer, as: 'customer' }]
      });

      logger.info(`Processing ${overdueInvoices.length} overdue invoices`);

      for (const invoice of overdueInvoices) {
        // TODO: Send overdue notice via exprsn-herald
        // TODO: Update subscription status if linked
        logger.warn('Invoice overdue', {
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          dueDate: invoice.dueDate,
          amountDue: invoice.amountDue
        });
      }

      return {
        processed: overdueInvoices.length,
        invoices: overdueInvoices
      };
    } catch (error) {
      logger.error('Failed to process overdue invoices', { error: error.message });
      throw error;
    }
  }
}

module.exports = new InvoiceService();
