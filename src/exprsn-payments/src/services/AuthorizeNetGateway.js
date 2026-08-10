const ApiContracts = require('authorizenet').APIContracts;
const ApiControllers = require('authorizenet').APIControllers;
const BasePaymentGateway = require('./BasePaymentGateway');
const { logger } = require('@exprsn/shared');
const crypto = require('crypto');

class AuthorizeNetGateway extends BasePaymentGateway {
  constructor(credentials, testMode = true) {
    super(credentials, testMode);

    const { apiLoginId, transactionKey } = credentials;
    if (!apiLoginId || !transactionKey) {
      throw new Error('Authorize.Net API Login ID and Transaction Key are required');
    }

    this.apiLoginId = apiLoginId;
    this.transactionKey = transactionKey;
    this.environment = testMode
      ? ApiContracts.Constants.endpoint.sandbox
      : ApiContracts.Constants.endpoint.production;

    logger.info('Authorize.Net gateway initialized', { testMode });
  }

  /**
   * Get merchant authentication
   */
  getMerchantAuth() {
    const merchantAuth = new ApiContracts.MerchantAuthenticationType();
    merchantAuth.setName(this.apiLoginId);
    merchantAuth.setTransactionKey(this.transactionKey);
    return merchantAuth;
  }

  /**
   * Process a payment using Authorize.Net
   */
  async processPayment(paymentData) {
    return new Promise((resolve) => {
      try {
        const {
          amount,
          cardNumber,
          expirationDate,
          cardCode,
          customerId,
          description,
          metadata = {}
        } = paymentData;

        // Create credit card object
        const creditCard = new ApiContracts.CreditCardType();
        creditCard.setCardNumber(cardNumber);
        creditCard.setExpirationDate(expirationDate);
        creditCard.setCardCode(cardCode);

        // Create payment type
        const payment = new ApiContracts.PaymentType();
        payment.setCreditCard(creditCard);

        // Create transaction request
        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
        transactionRequest.setPayment(payment);
        transactionRequest.setAmount(amount);

        if (description) {
          const order = new ApiContracts.OrderType();
          order.setDescription(description);
          transactionRequest.setOrder(order);
        }

        if (customerId) {
          const customer = new ApiContracts.CustomerDataType();
          customer.setId(customerId);
          transactionRequest.setCustomer(customer);
        }

        // Create request
        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        // Execute request
        const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            if (transactionResponse.getMessages() != null) {
              resolve({
                success: true,
                transactionId: transactionResponse.getTransId(),
                status: this.mapAuthNetStatus(transactionResponse.getResponseCode()),
                amount,
                authCode: transactionResponse.getAuthCode(),
                accountNumber: transactionResponse.getAccountNumber(),
                accountType: transactionResponse.getAccountType(),
                raw: transactionResponse
              });
            } else {
              const errors = transactionResponse.getErrors();
              const error = errors.getError()[0];
              resolve({
                success: false,
                error: error.getErrorCode(),
                message: error.getErrorText(),
                raw: transactionResponse
              });
            }
          } else {
            const errors = transactionResponse?.getErrors();
            const error = errors ? errors.getError()[0] : response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getErrorCode ? error.getErrorCode() : 'PAYMENT_FAILED',
              message: error.getErrorText ? error.getErrorText() : error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net payment error:', error);
        resolve({
          success: false,
          error: 'PAYMENT_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Create a customer profile
   */
  async createCustomer(customerData) {
    return new Promise((resolve) => {
      try {
        const {
          email,
          description,
          customerId
        } = customerData;

        const customerProfile = new ApiContracts.CustomerProfileType();
        customerProfile.setMerchantCustomerId(customerId || crypto.randomUUID());
        customerProfile.setDescription(description);
        customerProfile.setEmail(email);

        const createRequest = new ApiContracts.CreateCustomerProfileRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setProfile(customerProfile);

        const ctrl = new ApiControllers.CreateCustomerProfileController(createRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              customerId: response.getCustomerProfileId(),
              raw: response
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getCode(),
              message: error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net create customer error:', error);
        resolve({
          success: false,
          error: 'CUSTOMER_CREATION_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Get customer profile
   */
  async getCustomer(customerId) {
    return new Promise((resolve) => {
      try {
        const getRequest = new ApiContracts.GetCustomerProfileRequest();
        getRequest.setMerchantAuthentication(this.getMerchantAuth());
        getRequest.setCustomerProfileId(customerId);

        const ctrl = new ApiControllers.GetCustomerProfileController(getRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            const profile = response.getProfile();
            resolve({
              success: true,
              customer: {
                id: profile.getCustomerProfileId(),
                merchantCustomerId: profile.getMerchantCustomerId(),
                description: profile.getDescription(),
                email: profile.getEmail()
              },
              raw: response
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getCode(),
              message: error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net get customer error:', error);
        resolve({
          success: false,
          error: 'CUSTOMER_RETRIEVAL_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Update customer profile
   */
  async updateCustomer(customerId, updates) {
    return new Promise((resolve) => {
      try {
        const { email, description } = updates;

        const customerProfile = new ApiContracts.CustomerProfileExType();
        customerProfile.setCustomerProfileId(customerId);
        if (description) customerProfile.setDescription(description);
        if (email) customerProfile.setEmail(email);

        const updateRequest = new ApiContracts.UpdateCustomerProfileRequest();
        updateRequest.setMerchantAuthentication(this.getMerchantAuth());
        updateRequest.setProfile(customerProfile);

        const ctrl = new ApiControllers.UpdateCustomerProfileController(updateRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              customerId,
              raw: response
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getCode(),
              message: error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net update customer error:', error);
        resolve({
          success: false,
          error: 'CUSTOMER_UPDATE_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Delete customer profile
   */
  async deleteCustomer(customerId) {
    return new Promise((resolve) => {
      try {
        const deleteRequest = new ApiContracts.DeleteCustomerProfileRequest();
        deleteRequest.setMerchantAuthentication(this.getMerchantAuth());
        deleteRequest.setCustomerProfileId(customerId);

        const ctrl = new ApiControllers.DeleteCustomerProfileController(deleteRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              deleted: true,
              raw: response
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getCode(),
              message: error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net delete customer error:', error);
        resolve({
          success: false,
          error: 'CUSTOMER_DELETION_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Process a refund
   */
  async processRefund(refundData) {
    return new Promise((resolve) => {
      try {
        const {
          transactionId,
          amount,
          cardNumber // Last 4 digits required by Authorize.Net
        } = refundData;

        // Create credit card with last 4 digits
        const creditCard = new ApiContracts.CreditCardType();
        creditCard.setCardNumber(cardNumber);
        creditCard.setExpirationDate('XXXX');

        const payment = new ApiContracts.PaymentType();
        payment.setCreditCard(creditCard);

        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(ApiContracts.TransactionTypeEnum.REFUNDTRANSACTION);
        transactionRequest.setPayment(payment);
        transactionRequest.setAmount(amount);
        transactionRequest.setRefTransId(transactionId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              refundId: transactionResponse.getTransId(),
              status: this.mapAuthNetStatus(transactionResponse.getResponseCode()),
              amount,
              raw: transactionResponse
            });
          } else {
            const errors = transactionResponse?.getErrors();
            const error = errors ? errors.getError()[0] : response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getErrorCode ? error.getErrorCode() : error.getCode(),
              message: error.getErrorText ? error.getErrorText() : error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net refund error:', error);
        resolve({
          success: false,
          error: 'REFUND_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId) {
    return new Promise((resolve) => {
      try {
        const getRequest = new ApiContracts.GetTransactionDetailsRequest();
        getRequest.setMerchantAuthentication(this.getMerchantAuth());
        getRequest.setTransId(transactionId);

        const ctrl = new ApiControllers.GetTransactionDetailsController(getRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            const transaction = response.getTransaction();
            resolve({
              success: true,
              transaction: {
                id: transaction.getTransId(),
                status: this.mapAuthNetStatus(transaction.getResponseCode()),
                amount: transaction.getSettleAmount(),
                submitTime: transaction.getSubmitTimeUTC()
              },
              raw: transaction
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getCode(),
              message: error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net get transaction error:', error);
        resolve({
          success: false,
          error: 'TRANSACTION_RETRIEVAL_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(authorizationId, captureData = {}) {
    return new Promise((resolve) => {
      try {
        const { amount } = captureData;

        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(ApiContracts.TransactionTypeEnum.PRIORAUTHCAPTURETRANSACTION);
        transactionRequest.setAmount(amount);
        transactionRequest.setRefTransId(authorizationId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              transactionId: transactionResponse.getTransId(),
              status: this.mapAuthNetStatus(transactionResponse.getResponseCode()),
              amount,
              raw: transactionResponse
            });
          } else {
            const errors = transactionResponse?.getErrors();
            const error = errors ? errors.getError()[0] : response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getErrorCode ? error.getErrorCode() : error.getCode(),
              message: error.getErrorText ? error.getErrorText() : error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net capture error:', error);
        resolve({
          success: false,
          error: 'CAPTURE_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Void an authorized payment
   */
  async voidPayment(authorizationId) {
    return new Promise((resolve) => {
      try {
        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(ApiContracts.TransactionTypeEnum.VOIDTRANSACTION);
        transactionRequest.setRefTransId(authorizationId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
            resolve({
              success: true,
              transactionId: transactionResponse.getTransId(),
              status: 'voided',
              raw: transactionResponse
            });
          } else {
            const errors = transactionResponse?.getErrors();
            const error = errors ? errors.getError()[0] : response.getMessages().getMessage()[0];
            resolve({
              success: false,
              error: error.getErrorCode ? error.getErrorCode() : error.getCode(),
              message: error.getErrorText ? error.getErrorText() : error.getText(),
              raw: response
            });
          }
        });
      } catch (error) {
        logger.error('Authorize.Net void error:', error);
        resolve({
          success: false,
          error: 'VOID_FAILED',
          message: error.message,
          raw: error
        });
      }
    });
  }

  /**
   * Payment method operations not directly supported in same way as Stripe
   */
  async createPaymentMethod(paymentMethodData) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'Authorize.Net handles payment methods through customer payment profiles'
    };
  }

  async attachPaymentMethod(paymentMethodId, customerId) {
    return {
      success: false,
      error: 'NOT_SUPPORTED',
      message: 'Authorize.Net handles payment methods through customer payment profiles'
    };
  }

  /**
   * Verify Authorize.Net webhook signature
   */
  verifyWebhookSignature(payload, signature, signatureKey) {
    try {
      const hash = crypto
        .createHmac('sha512', signatureKey)
        .update(JSON.stringify(payload))
        .digest('hex')
        .toUpperCase();

      return hash === signature.toUpperCase();
    } catch (error) {
      logger.error('Authorize.Net webhook verification failed:', error);
      return false;
    }
  }

  /**
   * Parse Authorize.Net webhook event
   */
  parseWebhookEvent(payload) {
    return {
      id: payload.webhookId,
      type: payload.eventType,
      data: payload.payload,
      created: payload.eventDate
    };
  }

  /**
   * Map Authorize.Net response code to standard status
   */
  mapAuthNetStatus(responseCode) {
    const statusMap = {
      '1': 'succeeded', // Approved
      '2': 'failed',    // Declined
      '3': 'failed',    // Error
      '4': 'pending'    // Held for review
    };

    return statusMap[responseCode] || 'pending';
  }
}

module.exports = AuthorizeNetGateway;
