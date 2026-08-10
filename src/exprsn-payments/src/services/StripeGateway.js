const Stripe = require('stripe');
const BasePaymentGateway = require('./BasePaymentGateway');
const { logger } = require('@exprsn/shared');

class StripeGateway extends BasePaymentGateway {
  constructor(credentials, testMode = true) {
    super(credentials, testMode);

    const apiKey = testMode ? credentials.testSecretKey : credentials.liveSecretKey;
    if (!apiKey) {
      throw new Error('Stripe API key is required');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2023-10-16'
    });

    logger.info('Stripe gateway initialized', { testMode });
  }

  /**
   * Process a payment using Stripe
   */
  async processPayment(paymentData) {
    try {
      const {
        amount,
        currency = 'usd',
        customerId,
        paymentMethodId,
        description,
        metadata = {},
        capture = true,
        returnUrl
      } = paymentData;

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        customer: customerId,
        payment_method: paymentMethodId,
        description,
        metadata,
        capture,
        confirmation_method: 'automatic',
        confirm: true,
        return_url: returnUrl
      });

      return {
        success: true,
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        paymentMethod: paymentIntent.payment_method,
        clientSecret: paymentIntent.client_secret,
        raw: paymentIntent
      };
    } catch (error) {
      logger.error('Stripe payment error:', error);
      return {
        success: false,
        error: error.code || 'PAYMENT_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Create a customer in Stripe
   */
  async createCustomer(customerData) {
    try {
      const {
        email,
        name,
        phone,
        description,
        metadata = {},
        paymentMethod
      } = customerData;

      const customer = await this.stripe.customers.create({
        email,
        name,
        phone,
        description,
        metadata,
        payment_method: paymentMethod
      });

      return {
        success: true,
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        raw: customer
      };
    } catch (error) {
      logger.error('Stripe create customer error:', error);
      return {
        success: false,
        error: error.code || 'CUSTOMER_CREATION_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Get customer details from Stripe
   */
  async getCustomer(customerId) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      return {
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          defaultPaymentMethod: customer.invoice_settings?.default_payment_method,
          metadata: customer.metadata
        },
        raw: customer
      };
    } catch (error) {
      logger.error('Stripe get customer error:', error);
      return {
        success: false,
        error: error.code || 'CUSTOMER_RETRIEVAL_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Update customer in Stripe
   */
  async updateCustomer(customerId, updates) {
    try {
      const customer = await this.stripe.customers.update(customerId, updates);

      return {
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone
        },
        raw: customer
      };
    } catch (error) {
      logger.error('Stripe update customer error:', error);
      return {
        success: false,
        error: error.code || 'CUSTOMER_UPDATE_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Delete customer from Stripe
   */
  async deleteCustomer(customerId) {
    try {
      const result = await this.stripe.customers.del(customerId);

      return {
        success: true,
        deleted: result.deleted,
        raw: result
      };
    } catch (error) {
      logger.error('Stripe delete customer error:', error);
      return {
        success: false,
        error: error.code || 'CUSTOMER_DELETION_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Create a payment method in Stripe
   */
  async createPaymentMethod(paymentMethodData) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.create(paymentMethodData);

      return {
        success: true,
        paymentMethodId: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card,
        raw: paymentMethod
      };
    } catch (error) {
      logger.error('Stripe create payment method error:', error);
      return {
        success: false,
        error: error.code || 'PAYMENT_METHOD_CREATION_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      return {
        success: true,
        paymentMethodId: paymentMethod.id,
        customerId: paymentMethod.customer,
        raw: paymentMethod
      };
    } catch (error) {
      logger.error('Stripe attach payment method error:', error);
      return {
        success: false,
        error: error.code || 'PAYMENT_METHOD_ATTACH_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Process a refund in Stripe
   */
  async processRefund(refundData) {
    try {
      const {
        transactionId,
        amount,
        reason,
        metadata = {}
      } = refundData;

      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason,
        metadata
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount / 100,
        currency: refund.currency.toUpperCase(),
        raw: refund
      };
    } catch (error) {
      logger.error('Stripe refund error:', error);
      return {
        success: false,
        error: error.code || 'REFUND_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Get transaction details from Stripe
   */
  async getTransaction(transactionId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(transactionId);

      return {
        success: true,
        transaction: {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          status: this.mapStripeStatus(paymentIntent.status),
          customerId: paymentIntent.customer,
          paymentMethod: paymentIntent.payment_method,
          description: paymentIntent.description,
          metadata: paymentIntent.metadata
        },
        raw: paymentIntent
      };
    } catch (error) {
      logger.error('Stripe get transaction error:', error);
      return {
        success: false,
        error: error.code || 'TRANSACTION_RETRIEVAL_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(authorizationId, captureData = {}) {
    try {
      const { amount } = captureData;

      const paymentIntent = await this.stripe.paymentIntents.capture(authorizationId, {
        amount_to_capture: amount ? Math.round(amount * 100) : undefined
      });

      return {
        success: true,
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100,
        raw: paymentIntent
      };
    } catch (error) {
      logger.error('Stripe capture error:', error);
      return {
        success: false,
        error: error.code || 'CAPTURE_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Void an authorized payment
   */
  async voidPayment(authorizationId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(authorizationId);

      return {
        success: true,
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        raw: paymentIntent
      };
    } catch (error) {
      logger.error('Stripe void error:', error);
      return {
        success: false,
        error: error.code || 'VOID_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, secret);
      return true;
    } catch (error) {
      logger.error('Stripe webhook verification failed:', error);
      return false;
    }
  }

  /**
   * Parse Stripe webhook event
   */
  parseWebhookEvent(payload) {
    return {
      id: payload.id,
      type: payload.type,
      data: payload.data,
      created: payload.created
    };
  }

  /**
   * Map Stripe status to standard status
   */
  mapStripeStatus(stripeStatus) {
    const statusMap = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'pending',
      'processing': 'processing',
      'requires_capture': 'processing',
      'succeeded': 'succeeded',
      'canceled': 'canceled',
      'failed': 'failed'
    };

    return statusMap[stripeStatus] || 'pending';
  }
}

module.exports = StripeGateway;
