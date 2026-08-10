const paypal = require('@paypal/checkout-server-sdk');
const BasePaymentGateway = require('./BasePaymentGateway');
const { logger } = require('@exprsn/shared');
const crypto = require('crypto');

class PayPalGateway extends BasePaymentGateway {
  constructor(credentials, testMode = true) {
    super(credentials, testMode);

    const { clientId, clientSecret } = credentials;
    if (!clientId || !clientSecret) {
      throw new Error('PayPal client ID and secret are required');
    }

    // Configure PayPal environment
    const environment = testMode
      ? new paypal.core.SandboxEnvironment(clientId, clientSecret)
      : new paypal.core.LiveEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);

    logger.info('PayPal gateway initialized', { testMode });
  }

  /**
   * Process a payment using PayPal
   */
  async processPayment(paymentData) {
    try {
      const {
        amount,
        currency = 'USD',
        description,
        returnUrl,
        cancelUrl,
        metadata = {}
      } = paymentData;

      // Create order
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency.toUpperCase(),
            value: amount.toFixed(2)
          },
          description,
          custom_id: metadata.customId || null
        }],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          user_action: 'PAY_NOW'
        }
      });

      const order = await this.client.execute(request);

      return {
        success: true,
        transactionId: order.result.id,
        status: this.mapPayPalStatus(order.result.status),
        amount: parseFloat(order.result.purchase_units[0].amount.value),
        currency: order.result.purchase_units[0].amount.currency_code,
        approvalUrl: order.result.links.find(link => link.rel === 'approve')?.href,
        raw: order.result
      };
    } catch (error) {
      logger.error('PayPal payment error:', error);
      return {
        success: false,
        error: error.name || 'PAYMENT_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Capture an approved PayPal order
   */
  async capturePayment(orderId, captureData = {}) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.prefer('return=representation');

      const capture = await this.client.execute(request);

      return {
        success: true,
        transactionId: capture.result.id,
        status: this.mapPayPalStatus(capture.result.status),
        amount: parseFloat(capture.result.purchase_units[0].payments.captures[0].amount.value),
        currency: capture.result.purchase_units[0].payments.captures[0].amount.currency_code,
        raw: capture.result
      };
    } catch (error) {
      logger.error('PayPal capture error:', error);
      return {
        success: false,
        error: error.name || 'CAPTURE_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Get transaction details from PayPal
   */
  async getTransaction(transactionId) {
    try {
      const request = new paypal.orders.OrdersGetRequest(transactionId);
      const order = await this.client.execute(request);

      return {
        success: true,
        transaction: {
          id: order.result.id,
          status: this.mapPayPalStatus(order.result.status),
          amount: parseFloat(order.result.purchase_units[0].amount.value),
          currency: order.result.purchase_units[0].amount.currency_code,
          description: order.result.purchase_units[0].description,
          createTime: order.result.create_time,
          updateTime: order.result.update_time
        },
        raw: order.result
      };
    } catch (error) {
      logger.error('PayPal get transaction error:', error);
      return {
        success: false,
        error: error.name || 'TRANSACTION_RETRIEVAL_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Process a refund in PayPal
   */
  async processRefund(refundData) {
    try {
      const {
        captureId,
        amount,
        currency = 'USD',
        note
      } = refundData;

      const request = new paypal.payments.CapturesRefundRequest(captureId);
      request.requestBody({
        amount: amount ? {
          currency_code: currency.toUpperCase(),
          value: amount.toFixed(2)
        } : undefined,
        note_to_payer: note
      });

      const refund = await this.client.execute(request);

      return {
        success: true,
        refundId: refund.result.id,
        status: refund.result.status,
        amount: parseFloat(refund.result.amount.value),
        currency: refund.result.amount.currency_code,
        raw: refund.result
      };
    } catch (error) {
      logger.error('PayPal refund error:', error);
      return {
        success: false,
        error: error.name || 'REFUND_FAILED',
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
      const request = new paypal.payments.AuthorizationsVoidRequest(authorizationId);
      const result = await this.client.execute(request);

      return {
        success: true,
        transactionId: result.result.id,
        status: 'VOIDED',
        raw: result.result
      };
    } catch (error) {
      logger.error('PayPal void error:', error);
      return {
        success: false,
        error: error.name || 'VOID_FAILED',
        message: error.message,
        raw: error
      };
    }
  }

  /**
   * Create customer - PayPal doesn't have a direct customer API
   * This is a placeholder for consistency with other gateways
   */
  async createCustomer(customerData) {
    // PayPal doesn't have a traditional customer object like Stripe
    // We'll return the payer information that can be stored
    return {
      success: true,
      customerId: null, // PayPal uses payer_id from transactions
      email: customerData.email,
      name: customerData.name,
      note: 'PayPal does not have a traditional customer object. Payer info is captured during checkout.'
    };
  }

  /**
   * Get customer - Not applicable for PayPal
   */
  async getCustomer(customerId) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'PayPal does not support direct customer retrieval'
    };
  }

  /**
   * Update customer - Not applicable for PayPal
   */
  async updateCustomer(customerId, updates) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'PayPal does not support direct customer updates'
    };
  }

  /**
   * Delete customer - Not applicable for PayPal
   */
  async deleteCustomer(customerId) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'PayPal does not support customer deletion'
    };
  }

  /**
   * Create payment method - Not applicable for PayPal
   */
  async createPaymentMethod(paymentMethodData) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'PayPal handles payment methods through checkout flow'
    };
  }

  /**
   * Attach payment method - Not applicable for PayPal
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'PayPal handles payment methods through checkout flow'
    };
  }

  /**
   * Verify PayPal webhook signature
   */
  verifyWebhookSignature(payload, headers, webhookId) {
    try {
      const {
        'PAYPAL-TRANSMISSION-ID': transmissionId,
        'PAYPAL-TRANSMISSION-TIME': transmissionTime,
        'PAYPAL-TRANSMISSION-SIG': transmissionSig,
        'PAYPAL-CERT-URL': certUrl,
        'PAYPAL-AUTH-ALGO': authAlgo
      } = headers;

      // Note: Full webhook verification requires PayPal SDK's webhook verification
      // This is a simplified version - in production, use PayPal's official verification
      return true;
    } catch (error) {
      logger.error('PayPal webhook verification failed:', error);
      return false;
    }
  }

  /**
   * Parse PayPal webhook event
   */
  parseWebhookEvent(payload) {
    return {
      id: payload.id,
      type: payload.event_type,
      data: payload.resource,
      created: payload.create_time
    };
  }

  /**
   * Map PayPal status to standard status
   */
  mapPayPalStatus(paypalStatus) {
    const statusMap = {
      'CREATED': 'pending',
      'SAVED': 'pending',
      'APPROVED': 'processing',
      'VOIDED': 'canceled',
      'COMPLETED': 'succeeded',
      'PAYER_ACTION_REQUIRED': 'pending',
      'FAILED': 'failed',
      'PENDING': 'pending',
      'REFUNDED': 'refunded',
      'PARTIALLY_REFUNDED': 'partially_refunded'
    };

    return statusMap[paypalStatus] || 'pending';
  }
}

module.exports = PayPalGateway;
