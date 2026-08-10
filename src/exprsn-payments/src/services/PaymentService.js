const PaymentGatewayFactory = require('./PaymentGatewayFactory');
const { PaymentConfiguration, Transaction, Customer, Refund } = require('../models');
const { logger } = require('@exprsn/shared');
const { v4: uuidv4 } = require('uuid');

class PaymentService {
  /**
   * Get payment configuration for user or organization
   */
  static async getConfiguration(userId, organizationId = null, provider = null) {
    const where = organizationId
      ? { organizationId, isActive: true }
      : { userId, organizationId: null, isActive: true };

    if (provider) {
      where.provider = provider;
    }

    const config = await PaymentConfiguration.findOne({ where });

    if (!config) {
      throw new Error('Payment configuration not found');
    }

    return config;
  }

  /**
   * Get primary payment configuration
   */
  static async getPrimaryConfiguration(userId, organizationId = null) {
    const where = organizationId
      ? { organizationId, isActive: true, isPrimary: true }
      : { userId, organizationId: null, isActive: true, isPrimary: true };

    let config = await PaymentConfiguration.findOne({ where });

    // If no primary, get any active configuration
    if (!config) {
      delete where.isPrimary;
      config = await PaymentConfiguration.findOne({ where });
    }

    if (!config) {
      throw new Error('No active payment configuration found');
    }

    return config;
  }

  /**
   * Process a payment
   */
  static async processPayment(paymentData, userId, organizationId = null) {
    const {
      configurationId,
      provider,
      amount,
      currency = 'USD',
      customerId,
      paymentMethodId,
      description,
      metadata = {},
      idempotencyKey
    } = paymentData;

    try {
      // Check for duplicate transaction using idempotency key
      if (idempotencyKey) {
        const existingTransaction = await Transaction.findOne({
          where: { idempotencyKey }
        });

        if (existingTransaction) {
          logger.info('Duplicate transaction detected', { idempotencyKey });
          return existingTransaction;
        }
      }

      // Get payment configuration
      let config;
      if (configurationId) {
        config = await PaymentConfiguration.findByPk(configurationId);
      } else if (provider) {
        config = await this.getConfiguration(userId, organizationId, provider);
      } else {
        config = await this.getPrimaryConfiguration(userId, organizationId);
      }

      if (!config) {
        throw new Error('Payment configuration not found');
      }

      // Create gateway instance
      const gateway = PaymentGatewayFactory.getOrCreateGateway(
        config.id,
        config.provider,
        config.credentials,
        config.testMode
      );

      // Create transaction record
      const transaction = await Transaction.create({
        configurationId: config.id,
        userId,
        customerId,
        provider: config.provider,
        type: 'payment',
        status: 'pending',
        amount,
        currency: currency.toUpperCase(),
        description,
        metadata,
        idempotencyKey: idempotencyKey || uuidv4()
      });

      logger.info('Processing payment', {
        transactionId: transaction.id,
        provider: config.provider,
        amount,
        currency
      });

      // Process payment through gateway
      const result = await gateway.processPayment({
        amount,
        currency,
        customerId,
        paymentMethodId,
        description,
        metadata: {
          ...metadata,
          transactionId: transaction.id,
          userId
        }
      });

      // Update transaction with result
      await transaction.update({
        providerTransactionId: result.transactionId,
        status: result.success ? result.status : 'failed',
        paymentMethod: result.paymentMethod,
        paymentMethodDetails: result.raw?.payment_method_details || null,
        errorCode: result.error || null,
        errorMessage: result.message || null,
        providerResponse: result.raw,
        processedAt: result.success ? new Date() : null
      });

      logger.info('Payment processed', {
        transactionId: transaction.id,
        success: result.success,
        status: transaction.status
      });

      return transaction;
    } catch (error) {
      logger.error('Payment processing error:', error);
      throw error;
    }
  }

  /**
   * Process a refund
   */
  static async processRefund(refundData, userId) {
    const {
      transactionId,
      amount,
      reason,
      description
    } = refundData;

    try {
      // Get original transaction
      const transaction = await Transaction.findByPk(transactionId, {
        include: [{
          model: PaymentConfiguration,
          as: 'configuration'
        }]
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'succeeded') {
        throw new Error('Can only refund succeeded transactions');
      }

      // Check refund amount
      const refundAmount = amount || transaction.amount;
      const availableForRefund = parseFloat(transaction.amount) - parseFloat(transaction.amountRefunded);

      if (refundAmount > availableForRefund) {
        throw new Error('Refund amount exceeds available amount');
      }

      // Create gateway instance
      const gateway = PaymentGatewayFactory.getOrCreateGateway(
        transaction.configuration.id,
        transaction.provider,
        transaction.configuration.credentials,
        transaction.configuration.testMode
      );

      // Create refund record
      const refund = await Refund.create({
        transactionId: transaction.id,
        userId,
        provider: transaction.provider,
        status: 'pending',
        amount: refundAmount,
        currency: transaction.currency,
        reason,
        description
      });

      logger.info('Processing refund', {
        refundId: refund.id,
        transactionId: transaction.id,
        amount: refundAmount
      });

      // Process refund through gateway
      const result = await gateway.processRefund({
        transactionId: transaction.providerTransactionId,
        captureId: transaction.providerResponse?.capture_id, // For PayPal
        amount: refundAmount,
        currency: transaction.currency,
        reason,
        metadata: {
          refundId: refund.id,
          userId
        }
      });

      // Update refund with result
      await refund.update({
        providerRefundId: result.refundId,
        status: result.success ? 'succeeded' : 'failed',
        errorCode: result.error || null,
        errorMessage: result.message || null,
        providerResponse: result.raw,
        processedAt: result.success ? new Date() : null
      });

      // Update original transaction
      if (result.success) {
        const newAmountRefunded = parseFloat(transaction.amountRefunded) + refundAmount;
        const newStatus = newAmountRefunded >= parseFloat(transaction.amount)
          ? 'refunded'
          : 'partially_refunded';

        await transaction.update({
          amountRefunded: newAmountRefunded,
          status: newStatus,
          refundedAt: newStatus === 'refunded' ? new Date() : transaction.refundedAt
        });
      }

      logger.info('Refund processed', {
        refundId: refund.id,
        success: result.success,
        status: refund.status
      });

      return refund;
    } catch (error) {
      logger.error('Refund processing error:', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  static async getTransaction(transactionId, userId = null) {
    const where = { id: transactionId };
    if (userId) {
      where.userId = userId;
    }

    const transaction = await Transaction.findOne({
      where,
      include: [
        {
          model: PaymentConfiguration,
          as: 'configuration',
          attributes: ['id', 'provider', 'testMode']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'email', 'name']
        },
        {
          model: Refund,
          as: 'refunds'
        }
      ]
    });

    return transaction;
  }

  /**
   * List transactions
   */
  static async listTransactions(filters = {}, pagination = {}) {
    const {
      userId,
      organizationId,
      provider,
      status,
      type,
      startDate,
      endDate
    } = filters;

    const {
      limit = 50,
      offset = 0,
      orderBy = 'createdAt',
      orderDirection = 'DESC'
    } = pagination;

    const where = {};
    if (userId) where.userId = userId;
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = startDate;
      if (endDate) where.createdAt[Op.lte] = endDate;
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      limit,
      offset,
      order: [[orderBy, orderDirection]],
      include: [
        {
          model: PaymentConfiguration,
          as: 'configuration',
          attributes: ['id', 'provider', 'testMode']
        }
      ]
    });

    return {
      transactions: rows,
      total: count,
      limit,
      offset
    };
  }

  /**
   * Create or update customer
   */
  static async createCustomer(customerData, userId, provider) {
    const {
      email,
      name,
      phone,
      description,
      metadata = {}
    } = customerData;

    try {
      // Get configuration for the provider
      const config = await this.getConfiguration(userId, null, provider);

      // Create gateway instance
      const gateway = PaymentGatewayFactory.getOrCreateGateway(
        config.id,
        config.provider,
        config.credentials,
        config.testMode
      );

      // Create customer through gateway
      const result = await gateway.createCustomer({
        email,
        name,
        phone,
        description,
        metadata
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      // Save customer record
      const customer = await Customer.create({
        userId,
        provider: config.provider,
        providerCustomerId: result.customerId,
        email,
        name,
        phone,
        metadata
      });

      logger.info('Customer created', {
        customerId: customer.id,
        provider: config.provider
      });

      return customer;
    } catch (error) {
      logger.error('Customer creation error:', error);
      throw error;
    }
  }
}

module.exports = PaymentService;
