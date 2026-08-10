const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Chargeback, Transaction, Customer, Invoice } = require('../models');
const { logger } = require('@exprsn/shared');

class ChargebackService {
  /**
   * Create a chargeback record
   */
  async createChargeback({
    transactionId,
    provider,
    providerChargebackId,
    reason,
    amount,
    currency = 'USD',
    evidence = {},
    metadata = {}
  }) {
    try {
      const transaction = await Transaction.findByPk(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Calculate respond by date (typically 7-21 days depending on reason)
      const respondByDate = this.calculateRespondByDate(reason);

      // Create chargeback record
      const chargeback = await Chargeback.create({
        transactionId,
        customerId: transaction.customerId,
        provider,
        providerChargebackId,
        status: 'warning_needs_response',
        reason,
        amount,
        currency,
        evidence,
        respondByDate,
        metadata
      });

      logger.info('Chargeback created', {
        chargebackId: chargeback.id,
        transactionId,
        provider,
        reason,
        amount
      });

      // Send alert notification
      await this.sendChargebackAlert(chargeback);

      return chargeback;
    } catch (error) {
      logger.error('Failed to create chargeback', { error: error.message, transactionId });
      throw error;
    }
  }

  /**
   * Get chargeback by ID
   */
  async getChargeback(chargebackId) {
    const chargeback = await Chargeback.findByPk(chargebackId, {
      include: [
        { model: Transaction, as: 'transaction' },
        { model: Customer, as: 'customer' },
        { model: Invoice, as: 'invoice' }
      ]
    });

    if (!chargeback) {
      throw new Error('Chargeback not found');
    }

    return chargeback;
  }

  /**
   * List chargebacks with filters
   */
  async listChargebacks({
    customerId = null,
    transactionId = null,
    status = null,
    provider = null,
    limit = 20,
    offset = 0
  } = {}) {
    const where = {};

    if (customerId) where.customerId = customerId;
    if (transactionId) where.transactionId = transactionId;
    if (status) where.status = status;
    if (provider) where.provider = provider;

    const chargebacks = await Chargeback.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Transaction, as: 'transaction' },
        { model: Customer, as: 'customer' }
      ]
    });

    return chargebacks;
  }

  /**
   * Submit evidence for dispute
   */
  async submitEvidence(chargebackId, evidence) {
    try {
      const chargeback = await Chargeback.findByPk(chargebackId);
      if (!chargeback) {
        throw new Error('Chargeback not found');
      }

      if (!['warning_needs_response', 'needs_response'].includes(chargeback.status)) {
        throw new Error('Cannot submit evidence for chargeback in current status');
      }

      // Validate evidence based on chargeback reason
      this.validateEvidence(chargeback.reason, evidence);

      // Submit to provider
      let providerResponse;
      switch (chargeback.provider) {
        case 'stripe':
          providerResponse = await this.submitStripeEvidence(chargeback, evidence);
          break;

        case 'paypal':
          providerResponse = await this.submitPayPalEvidence(chargeback, evidence);
          break;

        case 'authorize_net':
          providerResponse = await this.submitAuthorizeNetEvidence(chargeback, evidence);
          break;

        default:
          throw new Error(`Unsupported provider: ${chargeback.provider}`);
      }

      // Update chargeback with evidence
      await chargeback.update({
        status: 'under_review',
        evidence: {
          ...chargeback.evidence,
          ...evidence,
          submittedAt: new Date(),
          providerResponse
        },
        evidenceSubmittedAt: new Date()
      });

      logger.info('Chargeback evidence submitted', {
        chargebackId,
        provider: chargeback.provider
      });

      return chargeback;
    } catch (error) {
      logger.error('Failed to submit evidence', { error: error.message, chargebackId });
      throw error;
    }
  }

  /**
   * Submit evidence to Stripe
   */
  async submitStripeEvidence(chargeback, evidence) {
    try {
      const disputeUpdate = await stripe.disputes.update(chargeback.providerChargebackId, {
        evidence: {
          customer_name: evidence.customerName,
          customer_email_address: evidence.customerEmail,
          billing_address: evidence.billingAddress,
          receipt: evidence.receiptUrl,
          customer_signature: evidence.customerSignature,
          shipping_documentation: evidence.shippingDocumentation,
          customer_communication: evidence.customerCommunication,
          service_documentation: evidence.serviceDocumentation,
          duplicate_charge_documentation: evidence.duplicateChargeDocumentation,
          refund_policy: evidence.refundPolicy,
          cancellation_policy: evidence.cancellationPolicy,
          product_description: evidence.productDescription,
          shipping_carrier: evidence.shippingCarrier,
          shipping_tracking_number: evidence.shippingTrackingNumber,
          shipping_date: evidence.shippingDate
        },
        metadata: evidence.metadata || {}
      });

      return {
        status: disputeUpdate.status,
        submittedAt: new Date(),
        providerData: disputeUpdate
      };
    } catch (error) {
      logger.error('Stripe evidence submission failed', { error: error.message });
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Submit evidence to PayPal (placeholder)
   */
  async submitPayPalEvidence(chargeback, evidence) {
    // TODO: Implement PayPal dispute evidence submission
    logger.warn('PayPal evidence submission not yet implemented');
    return {
      status: 'pending',
      submittedAt: new Date()
    };
  }

  /**
   * Submit evidence to Authorize.Net (placeholder)
   */
  async submitAuthorizeNetEvidence(chargeback, evidence) {
    // TODO: Implement Authorize.Net dispute evidence submission
    logger.warn('Authorize.Net evidence submission not yet implemented');
    return {
      status: 'pending',
      submittedAt: new Date()
    };
  }

  /**
   * Accept chargeback (merchant loses)
   */
  async acceptChargeback(chargebackId, reason = null) {
    try {
      const chargeback = await Chargeback.findByPk(chargebackId);
      if (!chargeback) {
        throw new Error('Chargeback not found');
      }

      if (chargeback.status === 'lost' || chargeback.status === 'won') {
        throw new Error('Chargeback already resolved');
      }

      // Close dispute with provider
      switch (chargeback.provider) {
        case 'stripe':
          await stripe.disputes.close(chargeback.providerChargebackId);
          break;

        case 'paypal':
          // TODO: Implement PayPal dispute closure
          break;

        case 'authorize_net':
          // TODO: Implement Authorize.Net dispute closure
          break;
      }

      // Update chargeback
      await chargeback.update({
        status: 'lost',
        resolvedAt: new Date(),
        metadata: {
          ...chargeback.metadata,
          acceptanceReason: reason
        }
      });

      logger.info('Chargeback accepted (lost)', { chargebackId, reason });

      // Send notification
      await this.sendChargebackResolutionNotification(chargeback);

      return chargeback;
    } catch (error) {
      logger.error('Failed to accept chargeback', { error: error.message, chargebackId });
      throw error;
    }
  }

  /**
   * Update chargeback status (webhook handler)
   */
  async updateChargebackStatus(providerChargebackId, status, provider) {
    try {
      const chargeback = await Chargeback.findOne({
        where: { providerChargebackId, provider }
      });

      if (!chargeback) {
        logger.warn('Chargeback not found for status update', { providerChargebackId, provider });
        return null;
      }

      const statusMapping = {
        // Stripe statuses
        warning_needs_response: 'warning_needs_response',
        warning_under_review: 'under_review',
        warning_closed: 'won',
        needs_response: 'needs_response',
        under_review: 'under_review',
        charge_refunded: 'lost',
        won: 'won',
        lost: 'lost'
      };

      const mappedStatus = statusMapping[status] || status;

      await chargeback.update({
        status: mappedStatus,
        resolvedAt: ['won', 'lost'].includes(mappedStatus) ? new Date() : null
      });

      logger.info('Chargeback status updated', {
        chargebackId: chargeback.id,
        oldStatus: chargeback.status,
        newStatus: mappedStatus
      });

      // Send notification on resolution
      if (['won', 'lost'].includes(mappedStatus)) {
        await this.sendChargebackResolutionNotification(chargeback);
      }

      return chargeback;
    } catch (error) {
      logger.error('Failed to update chargeback status', { error: error.message, providerChargebackId });
      throw error;
    }
  }

  /**
   * Get chargeback statistics
   */
  async getChargebackStats(customerId = null, dateRange = null) {
    try {
      const where = {};

      if (customerId) {
        where.customerId = customerId;
      }

      if (dateRange) {
        where.createdAt = {
          [require('sequelize').Op.between]: [dateRange.startDate, dateRange.endDate]
        };
      }

      const stats = await Chargeback.findAll({
        where,
        attributes: [
          'status',
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
          [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalAmount']
        ],
        group: ['status'],
        raw: true
      });

      // Calculate chargeback rate
      const totalChargebacks = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const lostChargebacks = stats.find(s => s.status === 'lost')?.count || 0;
      const wonChargebacks = stats.find(s => s.status === 'won')?.count || 0;

      return {
        byStatus: stats,
        summary: {
          total: totalChargebacks,
          won: parseInt(wonChargebacks),
          lost: parseInt(lostChargebacks),
          pending: totalChargebacks - parseInt(wonChargebacks) - parseInt(lostChargebacks),
          winRate: totalChargebacks > 0 ? ((wonChargebacks / totalChargebacks) * 100).toFixed(2) : 0
        }
      };
    } catch (error) {
      logger.error('Failed to get chargeback stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get chargebacks needing attention
   */
  async getChargebacksNeedingAttention() {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    const chargebacks = await Chargeback.findAll({
      where: {
        status: {
          [require('sequelize').Op.in]: ['warning_needs_response', 'needs_response']
        },
        respondByDate: {
          [require('sequelize').Op.lte]: threeDaysFromNow
        }
      },
      order: [['respondByDate', 'ASC']],
      include: [
        { model: Transaction, as: 'transaction' },
        { model: Customer, as: 'customer' }
      ]
    });

    logger.info(`Found ${chargebacks.length} chargebacks needing attention`);

    return chargebacks;
  }

  /**
   * Calculate respond by date based on chargeback reason
   */
  calculateRespondByDate(reason) {
    const now = new Date();
    let daysToRespond;

    // Different reasons have different response windows
    switch (reason) {
      case 'fraudulent':
        daysToRespond = 7; // Urgent
        break;
      case 'product_not_received':
      case 'product_unacceptable':
        daysToRespond = 14;
        break;
      case 'duplicate':
      case 'subscription_canceled':
        daysToRespond = 10;
        break;
      default:
        daysToRespond = 21; // Standard response time
    }

    const respondByDate = new Date(now.getTime() + (daysToRespond * 24 * 60 * 60 * 1000));
    return respondByDate;
  }

  /**
   * Validate evidence based on chargeback reason
   */
  validateEvidence(reason, evidence) {
    const requiredFields = {
      fraudulent: ['customerName', 'customerEmail', 'billingAddress', 'customerSignature'],
      product_not_received: ['shippingCarrier', 'shippingTrackingNumber', 'shippingDate'],
      product_unacceptable: ['productDescription', 'customerCommunication', 'refundPolicy'],
      duplicate: ['duplicateChargeDocumentation', 'receiptUrl'],
      subscription_canceled: ['cancellationPolicy', 'customerCommunication']
    };

    const required = requiredFields[reason] || [];
    const missing = required.filter(field => !evidence[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required evidence fields for ${reason}: ${missing.join(', ')}`);
    }
  }

  /**
   * Send chargeback alert notification
   */
  async sendChargebackAlert(chargeback) {
    // TODO: Integration with exprsn-herald for email/SMS alerts
    logger.info('Chargeback alert notification needed', {
      chargebackId: chargeback.id,
      amount: chargeback.amount,
      respondByDate: chargeback.respondByDate
    });
  }

  /**
   * Send chargeback resolution notification
   */
  async sendChargebackResolutionNotification(chargeback) {
    // TODO: Integration with exprsn-herald
    logger.info('Chargeback resolution notification needed', {
      chargebackId: chargeback.id,
      status: chargeback.status
    });
  }

  /**
   * Handle chargeback webhook events
   */
  async handleWebhookEvent(provider, event) {
    try {
      switch (provider) {
        case 'stripe':
          await this.handleStripeChargebackWebhook(event);
          break;

        case 'paypal':
          await this.handlePayPalChargebackWebhook(event);
          break;

        case 'authorize_net':
          await this.handleAuthorizeNetChargebackWebhook(event);
          break;
      }

      logger.info('Chargeback webhook processed', { provider, eventType: event.type });
    } catch (error) {
      logger.error('Chargeback webhook processing failed', { error: error.message, provider });
      throw error;
    }
  }

  /**
   * Handle Stripe chargeback webhooks
   */
  async handleStripeChargebackWebhook(event) {
    switch (event.type) {
      case 'charge.dispute.created':
        await this.createChargebackFromStripeDispute(event.data.object);
        break;

      case 'charge.dispute.updated':
        await this.updateChargebackStatus(
          event.data.object.id,
          event.data.object.status,
          'stripe'
        );
        break;

      case 'charge.dispute.closed':
        await this.updateChargebackStatus(
          event.data.object.id,
          event.data.object.status,
          'stripe'
        );
        break;

      case 'charge.dispute.funds_withdrawn':
        logger.warn('Dispute funds withdrawn', {
          disputeId: event.data.object.id,
          amount: event.data.object.amount
        });
        break;

      case 'charge.dispute.funds_reinstated':
        logger.info('Dispute funds reinstated (won)', {
          disputeId: event.data.object.id,
          amount: event.data.object.amount
        });
        break;
    }
  }

  /**
   * Create chargeback from Stripe dispute webhook
   */
  async createChargebackFromStripeDispute(dispute) {
    // Find transaction by Stripe charge ID
    const transaction = await Transaction.findOne({
      where: { providerTransactionId: dispute.charge }
    });

    if (!transaction) {
      logger.error('Transaction not found for Stripe dispute', { chargeId: dispute.charge });
      return;
    }

    // Check if chargeback already exists
    const existingChargeback = await Chargeback.findOne({
      where: { providerChargebackId: dispute.id }
    });

    if (existingChargeback) {
      logger.info('Chargeback already exists', { chargebackId: existingChargeback.id });
      return existingChargeback;
    }

    // Create chargeback
    return await this.createChargeback({
      transactionId: transaction.id,
      provider: 'stripe',
      providerChargebackId: dispute.id,
      reason: dispute.reason,
      amount: dispute.amount / 100, // Convert from cents
      currency: dispute.currency.toUpperCase(),
      evidence: dispute.evidence_details || {},
      metadata: {
        isCharge_refundable: dispute.is_charge_refundable,
        created: dispute.created
      }
    });
  }

  /**
   * Handle PayPal chargeback webhooks (placeholder)
   */
  async handlePayPalChargebackWebhook(event) {
    // TODO: Implement PayPal chargeback webhook handling
    logger.info('PayPal chargeback webhook received', { event });
  }

  /**
   * Handle Authorize.Net chargeback webhooks (placeholder)
   */
  async handleAuthorizeNetChargebackWebhook(event) {
    // TODO: Implement Authorize.Net chargeback webhook handling
    logger.info('Authorize.Net chargeback webhook received', { event });
  }
}

module.exports = new ChargebackService();
