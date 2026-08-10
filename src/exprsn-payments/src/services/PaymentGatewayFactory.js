const StripeGateway = require('./StripeGateway');
const PayPalGateway = require('./PayPalGateway');
const AuthorizeNetGateway = require('./AuthorizeNetGateway');
const { logger } = require('@exprsn/shared');

/**
 * Payment Gateway Factory
 * Creates and manages payment gateway instances
 */
class PaymentGatewayFactory {
  static gateways = new Map();

  /**
   * Create a payment gateway instance
   * @param {string} provider - Payment provider (stripe, paypal, authorizenet)
   * @param {Object} credentials - Provider credentials
   * @param {boolean} testMode - Whether to use test mode
   * @returns {BasePaymentGateway} Gateway instance
   */
  static createGateway(provider, credentials, testMode = true) {
    try {
      logger.info('Creating payment gateway', { provider, testMode });

      switch (provider.toLowerCase()) {
        case 'stripe':
          return new StripeGateway(credentials, testMode);

        case 'paypal':
          return new PayPalGateway(credentials, testMode);

        case 'authorizenet':
          return new AuthorizeNetGateway(credentials, testMode);

        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Error creating payment gateway:', error);
      throw error;
    }
  }

  /**
   * Get a cached gateway instance or create new one
   * @param {string} configId - Payment configuration ID
   * @param {string} provider - Payment provider
   * @param {Object} credentials - Provider credentials
   * @param {boolean} testMode - Whether to use test mode
   * @returns {BasePaymentGateway} Gateway instance
   */
  static getOrCreateGateway(configId, provider, credentials, testMode = true) {
    const cacheKey = `${configId}-${provider}-${testMode}`;

    if (this.gateways.has(cacheKey)) {
      logger.debug('Using cached gateway instance', { configId, provider });
      return this.gateways.get(cacheKey);
    }

    const gateway = this.createGateway(provider, credentials, testMode);
    this.gateways.set(cacheKey, gateway);

    logger.debug('Created and cached gateway instance', { configId, provider });
    return gateway;
  }

  /**
   * Clear cached gateway for a configuration
   * @param {string} configId - Payment configuration ID
   */
  static clearGateway(configId) {
    const keysToDelete = [];
    for (const [key] of this.gateways) {
      if (key.startsWith(configId)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.gateways.delete(key);
      logger.debug('Cleared cached gateway', { key });
    });
  }

  /**
   * Clear all cached gateways
   */
  static clearAllGateways() {
    this.gateways.clear();
    logger.info('Cleared all cached gateways');
  }

  /**
   * Get supported providers
   * @returns {Array<string>} List of supported providers
   */
  static getSupportedProviders() {
    return ['stripe', 'paypal', 'authorizenet'];
  }

  /**
   * Validate provider name
   * @param {string} provider - Provider name
   * @returns {boolean} Whether provider is supported
   */
  static isProviderSupported(provider) {
    return this.getSupportedProviders().includes(provider.toLowerCase());
  }
}

module.exports = PaymentGatewayFactory;
