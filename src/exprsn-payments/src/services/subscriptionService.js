const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Subscription, Customer, Invoice } = require('../models');
const { logger } = require('@exprsn/shared');

class SubscriptionService {
  /**
   * Create a new subscription
   */
  async createSubscription({ customerId, planId, provider, billingCycle, quantity = 1, trialDays = 0, metadata = {} }) {
    try {
      const customer = await Customer.findByPk(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      let providerSubscriptionId;
      let currentPeriodStart = new Date();
      let currentPeriodEnd = this.calculatePeriodEnd(currentPeriodStart, billingCycle);
      let trialEndsAt = null;
      let status = 'active';

      // Calculate trial end date if trial period provided
      if (trialDays > 0) {
        trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
        status = 'trialing';
      }

      // Create subscription with payment provider
      switch (provider) {
        case 'stripe':
          providerSubscriptionId = await this.createStripeSubscription({
            customer,
            planId,
            quantity,
            trialDays,
            metadata
          });
          break;

        case 'paypal':
          providerSubscriptionId = await this.createPayPalSubscription({
            customer,
            planId,
            quantity,
            metadata
          });
          break;

        case 'authorize_net':
          providerSubscriptionId = await this.createAuthorizeNetSubscription({
            customer,
            planId,
            quantity,
            metadata
          });
          break;

        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }

      // Get plan details to calculate amount
      const planDetails = await this.getPlanDetails(planId, provider);
      const amount = planDetails.amount * quantity;

      // Create subscription in database
      const subscription = await Subscription.create({
        customerId,
        planId,
        provider,
        providerSubscriptionId,
        status,
        billingCycle,
        amount,
        currency: planDetails.currency || 'USD',
        quantity,
        trialEndsAt,
        currentPeriodStart,
        currentPeriodEnd,
        metadata
      });

      logger.info('Subscription created', {
        subscriptionId: subscription.id,
        customerId,
        provider,
        planId,
        amount
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { error: error.message, customerId, planId });
      throw error;
    }
  }

  /**
   * Create Stripe subscription
   */
  async createStripeSubscription({ customer, planId, quantity, trialDays, metadata }) {
    try {
      const subscriptionData = {
        customer: customer.stripeCustomerId,
        items: [{ price: planId, quantity }],
        metadata,
        expand: ['latest_invoice.payment_intent']
      };

      if (trialDays > 0) {
        subscriptionData.trial_period_days = trialDays;
      }

      const stripeSubscription = await stripe.subscriptions.create(subscriptionData);

      return stripeSubscription.id;
    } catch (error) {
      logger.error('Stripe subscription creation failed', { error: error.message });
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Create PayPal subscription (placeholder - requires PayPal subscription API)
   */
  async createPayPalSubscription({ customer, planId, quantity, metadata }) {
    // TODO: Implement PayPal subscription creation
    // This requires PayPal Billing Plans API
    logger.warn('PayPal subscription creation not yet implemented');
    const timestamp = Date.now();
    return `paypal_sub_${timestamp}`;
  }

  /**
   * Create Authorize.Net subscription (placeholder)
   */
  async createAuthorizeNetSubscription({ customer, planId, quantity, metadata }) {
    // TODO: Implement Authorize.Net ARB (Automated Recurring Billing)
    logger.warn('Authorize.Net subscription creation not yet implemented');
    const timestamp = Date.now();
    return `authnet_sub_${timestamp}`;
  }

  /**
   * Update subscription
   */
  async updateSubscription(subscriptionId, updates) {
    try {
      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update provider subscription if needed
      if (updates.quantity && updates.quantity !== subscription.quantity) {
        await this.updateProviderSubscription(subscription, { quantity: updates.quantity });
      }

      if (updates.planId && updates.planId !== subscription.planId) {
        await this.updateProviderSubscription(subscription, { planId: updates.planId });
      }

      // Update database
      await subscription.update(updates);

      logger.info('Subscription updated', { subscriptionId, updates });

      return subscription;
    } catch (error) {
      logger.error('Failed to update subscription', { error: error.message, subscriptionId });
      throw error;
    }
  }

  /**
   * Update provider subscription
   */
  async updateProviderSubscription(subscription, updates) {
    switch (subscription.provider) {
      case 'stripe':
        const updateData = {};

        if (updates.quantity) {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.providerSubscriptionId);
          updateData.items = [{
            id: stripeSubscription.items.data[0].id,
            quantity: updates.quantity
          }];
        }

        if (updates.planId) {
          updateData.items = [{
            price: updates.planId
          }];
        }

        await stripe.subscriptions.update(subscription.providerSubscriptionId, updateData);
        break;

      case 'paypal':
        // TODO: Implement PayPal subscription update
        break;

      case 'authorize_net':
        // TODO: Implement Authorize.Net subscription update
        break;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId, { immediate = false, reason = null } = {}) {
    try {
      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status === 'canceled') {
        throw new Error('Subscription is already canceled');
      }

      // Cancel with provider
      switch (subscription.provider) {
        case 'stripe':
          await stripe.subscriptions.update(subscription.providerSubscriptionId, {
            cancel_at_period_end: !immediate,
            metadata: { cancellation_reason: reason }
          });

          if (immediate) {
            await stripe.subscriptions.cancel(subscription.providerSubscriptionId);
          }
          break;

        case 'paypal':
          // TODO: Implement PayPal subscription cancellation
          break;

        case 'authorize_net':
          // TODO: Implement Authorize.Net subscription cancellation
          break;
      }

      // Update database
      const updates = {
        canceledAt: new Date(),
        cancelAtPeriodEnd: !immediate,
        metadata: { ...subscription.metadata, cancellationReason: reason }
      };

      if (immediate) {
        updates.status = 'canceled';
        updates.endedAt = new Date();
      }

      await subscription.update(updates);

      logger.info('Subscription canceled', {
        subscriptionId,
        immediate,
        reason
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', { error: error.message, subscriptionId });
      throw error;
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(subscriptionId) {
    try {
      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd) {
        throw new Error('Subscription is not canceled');
      }

      // Reactivate with provider
      switch (subscription.provider) {
        case 'stripe':
          await stripe.subscriptions.update(subscription.providerSubscriptionId, {
            cancel_at_period_end: false
          });
          break;

        case 'paypal':
          // TODO: Implement PayPal subscription reactivation
          break;

        case 'authorize_net':
          // TODO: Implement Authorize.Net subscription reactivation
          break;
      }

      // Update database
      await subscription.update({
        status: 'active',
        canceledAt: null,
        cancelAtPeriodEnd: false,
        endedAt: null
      });

      logger.info('Subscription reactivated', { subscriptionId });

      return subscription;
    } catch (error) {
      logger.error('Failed to reactivate subscription', { error: error.message, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscription with details
   */
  async getSubscription(subscriptionId) {
    const subscription = await Subscription.findByPk(subscriptionId, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Invoice, as: 'invoices', order: [['createdAt', 'DESC']], limit: 5 }
      ]
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    return subscription;
  }

  /**
   * List customer subscriptions
   */
  async listCustomerSubscriptions(customerId, { status = null, limit = 20, offset = 0 } = {}) {
    const where = { customerId };

    if (status) {
      where.status = status;
    }

    const subscriptions = await Subscription.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Customer, as: 'customer' }]
    });

    return subscriptions;
  }

  /**
   * Handle subscription webhook events
   */
  async handleWebhookEvent(provider, event) {
    try {
      switch (provider) {
        case 'stripe':
          await this.handleStripeWebhook(event);
          break;

        case 'paypal':
          await this.handlePayPalWebhook(event);
          break;

        case 'authorize_net':
          await this.handleAuthorizeNetWebhook(event);
          break;
      }

      logger.info('Webhook event processed', { provider, eventType: event.type });
    } catch (error) {
      logger.error('Webhook processing failed', { error: error.message, provider });
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleStripeWebhook(event) {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await this.syncStripeSubscription(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.markSubscriptionCanceled(event.data.object.id);
        break;

      case 'customer.subscription.trial_will_end':
        await this.notifyTrialEnding(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.recordSuccessfulPayment(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;
    }
  }

  /**
   * Sync Stripe subscription to database
   */
  async syncStripeSubscription(stripeSubscription) {
    const subscription = await Subscription.findOne({
      where: { providerSubscriptionId: stripeSubscription.id }
    });

    if (subscription) {
      await subscription.update({
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
      });
    }
  }

  /**
   * Calculate period end date based on billing cycle
   */
  calculatePeriodEnd(startDate, billingCycle) {
    const endDate = new Date(startDate);

    switch (billingCycle) {
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case 'biannual':
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    return endDate;
  }

  /**
   * Get plan details from provider
   */
  async getPlanDetails(planId, provider) {
    switch (provider) {
      case 'stripe':
        const price = await stripe.prices.retrieve(planId);
        return {
          amount: price.unit_amount / 100, // Convert from cents
          currency: price.currency.toUpperCase(),
          interval: price.recurring.interval
        };

      case 'paypal':
      case 'authorize_net':
        // TODO: Implement plan retrieval for other providers
        return {
          amount: 0,
          currency: 'USD',
          interval: 'month'
        };
    }
  }

  /**
   * Mark subscription as canceled
   */
  async markSubscriptionCanceled(providerSubscriptionId) {
    const subscription = await Subscription.findOne({
      where: { providerSubscriptionId }
    });

    if (subscription) {
      await subscription.update({
        status: 'canceled',
        endedAt: new Date()
      });
    }
  }

  /**
   * Notify customer that trial is ending
   */
  async notifyTrialEnding(stripeSubscription) {
    // TODO: Integration with exprsn-herald for email notification
    logger.info('Trial ending notification needed', {
      subscriptionId: stripeSubscription.id,
      trialEnd: new Date(stripeSubscription.trial_end * 1000)
    });
  }

  /**
   * Record successful payment for subscription
   */
  async recordSuccessfulPayment(invoice) {
    // TODO: Create Invoice record and Transaction record
    logger.info('Subscription payment succeeded', {
      invoiceId: invoice.id,
      amount: invoice.amount_paid / 100
    });
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(invoice) {
    const subscription = await Subscription.findOne({
      where: { providerSubscriptionId: invoice.subscription }
    });

    if (subscription) {
      await subscription.update({
        status: 'past_due'
      });

      // TODO: Send notification via exprsn-herald
      logger.warn('Subscription payment failed', {
        subscriptionId: subscription.id,
        invoiceId: invoice.id
      });
    }
  }

  /**
   * Handle PayPal webhook (placeholder)
   */
  async handlePayPalWebhook(event) {
    // TODO: Implement PayPal webhook handling
    logger.info('PayPal webhook received', { event });
  }

  /**
   * Handle Authorize.Net webhook (placeholder)
   */
  async handleAuthorizeNetWebhook(event) {
    // TODO: Implement Authorize.Net webhook handling
    logger.info('Authorize.Net webhook received', { event });
  }
}

module.exports = new SubscriptionService();
