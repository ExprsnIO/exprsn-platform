/**
 * Base Payment Gateway Interface
 * All payment gateway implementations must extend this class
 */
class BasePaymentGateway {
  constructor(credentials, testMode = true) {
    this.credentials = credentials;
    this.testMode = testMode;
  }

  /**
   * Process a payment
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Transaction result
   */
  async processPayment(paymentData) {
    throw new Error('processPayment() must be implemented by subclass');
  }

  /**
   * Create a customer
   * @param {Object} customerData - Customer details
   * @returns {Promise<Object>} Customer result
   */
  async createCustomer(customerData) {
    throw new Error('createCustomer() must be implemented by subclass');
  }

  /**
   * Get customer details
   * @param {string} customerId - Provider customer ID
   * @returns {Promise<Object>} Customer details
   */
  async getCustomer(customerId) {
    throw new Error('getCustomer() must be implemented by subclass');
  }

  /**
   * Update customer details
   * @param {string} customerId - Provider customer ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated customer
   */
  async updateCustomer(customerId, updates) {
    throw new Error('updateCustomer() must be implemented by subclass');
  }

  /**
   * Delete a customer
   * @param {string} customerId - Provider customer ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteCustomer(customerId) {
    throw new Error('deleteCustomer() must be implemented by subclass');
  }

  /**
   * Create a payment method
   * @param {Object} paymentMethodData - Payment method details
   * @returns {Promise<Object>} Payment method result
   */
  async createPaymentMethod(paymentMethodData) {
    throw new Error('createPaymentMethod() must be implemented by subclass');
  }

  /**
   * Attach payment method to customer
   * @param {string} paymentMethodId - Payment method ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<Object>} Attachment result
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    throw new Error('attachPaymentMethod() must be implemented by subclass');
  }

  /**
   * Process a refund
   * @param {Object} refundData - Refund details
   * @returns {Promise<Object>} Refund result
   */
  async processRefund(refundData) {
    throw new Error('processRefund() must be implemented by subclass');
  }

  /**
   * Get transaction details
   * @param {string} transactionId - Provider transaction ID
   * @returns {Promise<Object>} Transaction details
   */
  async getTransaction(transactionId) {
    throw new Error('getTransaction() must be implemented by subclass');
  }

  /**
   * Capture an authorized payment
   * @param {string} authorizationId - Authorization ID
   * @param {Object} captureData - Capture details
   * @returns {Promise<Object>} Capture result
   */
  async capturePayment(authorizationId, captureData) {
    throw new Error('capturePayment() must be implemented by subclass');
  }

  /**
   * Void an authorized payment
   * @param {string} authorizationId - Authorization ID
   * @returns {Promise<Object>} Void result
   */
  async voidPayment(authorizationId) {
    throw new Error('voidPayment() must be implemented by subclass');
  }

  /**
   * Verify webhook signature
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Webhook signature
   * @param {string} secret - Webhook secret
   * @returns {boolean} Verification result
   */
  verifyWebhookSignature(payload, signature, secret) {
    throw new Error('verifyWebhookSignature() must be implemented by subclass');
  }

  /**
   * Parse webhook event
   * @param {Object} payload - Webhook payload
   * @returns {Object} Parsed event
   */
  parseWebhookEvent(payload) {
    throw new Error('parseWebhookEvent() must be implemented by subclass');
  }
}

module.exports = BasePaymentGateway;
