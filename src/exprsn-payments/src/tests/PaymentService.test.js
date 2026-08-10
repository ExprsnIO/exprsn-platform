const PaymentService = require('../services/PaymentService');
const { PaymentConfiguration, Transaction, Customer } = require('../models');

// Mock the models
jest.mock('../models');

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfiguration', () => {
    it('should retrieve payment configuration for user', async () => {
      const mockConfig = {
        id: 'config-123',
        userId: 'user-123',
        provider: 'stripe',
        isActive: true
      };

      PaymentConfiguration.findOne = jest.fn().mockResolvedValue(mockConfig);

      const result = await PaymentService.getConfiguration('user-123', null, 'stripe');

      expect(PaymentConfiguration.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          organizationId: null,
          isActive: true,
          provider: 'stripe'
        }
      });
      expect(result).toEqual(mockConfig);
    });

    it('should throw error if configuration not found', async () => {
      PaymentConfiguration.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        PaymentService.getConfiguration('user-123')
      ).rejects.toThrow('Payment configuration not found');
    });
  });

  describe('getPrimaryConfiguration', () => {
    it('should retrieve primary configuration', async () => {
      const mockConfig = {
        id: 'config-123',
        userId: 'user-123',
        provider: 'stripe',
        isActive: true,
        isPrimary: true
      };

      PaymentConfiguration.findOne = jest.fn().mockResolvedValue(mockConfig);

      const result = await PaymentService.getPrimaryConfiguration('user-123');

      expect(result).toEqual(mockConfig);
    });

    it('should fallback to any active configuration if no primary', async () => {
      const mockConfig = {
        id: 'config-123',
        userId: 'user-123',
        provider: 'stripe',
        isActive: true,
        isPrimary: false
      };

      PaymentConfiguration.findOne = jest
        .fn()
        .mockResolvedValueOnce(null) // No primary
        .mockResolvedValueOnce(mockConfig); // Any active

      const result = await PaymentService.getPrimaryConfiguration('user-123');

      expect(result).toEqual(mockConfig);
      expect(PaymentConfiguration.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('processPayment', () => {
    it('should detect duplicate transactions using idempotency key', async () => {
      const existingTransaction = {
        id: 'txn-123',
        idempotencyKey: 'idempotency-key-123',
        status: 'succeeded'
      };

      Transaction.findOne = jest.fn().mockResolvedValue(existingTransaction);

      const paymentData = {
        amount: 100,
        idempotencyKey: 'idempotency-key-123'
      };

      const result = await PaymentService.processPayment(
        paymentData,
        'user-123'
      );

      expect(result).toEqual(existingTransaction);
      expect(Transaction.findOne).toHaveBeenCalledWith({
        where: { idempotencyKey: 'idempotency-key-123' }
      });
    });
  });

  describe('getTransaction', () => {
    it('should retrieve transaction with includes', async () => {
      const mockTransaction = {
        id: 'txn-123',
        userId: 'user-123',
        amount: 100,
        status: 'succeeded'
      };

      Transaction.findOne = jest.fn().mockResolvedValue(mockTransaction);

      const result = await PaymentService.getTransaction('txn-123', 'user-123');

      expect(Transaction.findOne).toHaveBeenCalledWith({
        where: { id: 'txn-123', userId: 'user-123' },
        include: expect.any(Array)
      });
      expect(result).toEqual(mockTransaction);
    });
  });
});

describe('PaymentGateway Integration', () => {
  describe('Error Handling', () => {
    it('should handle gateway initialization errors', () => {
      const PaymentGatewayFactory = require('../services/PaymentGatewayFactory');

      expect(() => {
        PaymentGatewayFactory.createGateway('invalid-provider', {}, true);
      }).toThrow('Unsupported payment provider');
    });

    it('should validate supported providers', () => {
      const PaymentGatewayFactory = require('../services/PaymentGatewayFactory');

      expect(PaymentGatewayFactory.isProviderSupported('stripe')).toBe(true);
      expect(PaymentGatewayFactory.isProviderSupported('paypal')).toBe(true);
      expect(PaymentGatewayFactory.isProviderSupported('authorizenet')).toBe(true);
      expect(PaymentGatewayFactory.isProviderSupported('invalid')).toBe(false);
    });
  });
});
