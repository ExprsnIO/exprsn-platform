module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      plan_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Provider plan/price ID (e.g., Stripe price_xxx)'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorize_net'),
        allowNull: false
      },
      provider_subscription_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Subscription ID from payment provider'
      },
      status: {
        type: Sequelize.ENUM(
          'active',
          'trialing',
          'past_due',
          'canceled',
          'incomplete',
          'incomplete_expired',
          'unpaid',
          'paused'
        ),
        allowNull: false,
        defaultValue: 'active'
      },
      billing_cycle: {
        type: Sequelize.ENUM('monthly', 'quarterly', 'yearly', 'biannual'),
        allowNull: false,
        defaultValue: 'monthly'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Subscription amount per billing cycle'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Number of seats/units'
      },
      trial_ends_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Trial period end date'
      },
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Current billing period start date'
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Current billing period end date'
      },
      cancel_at_period_end: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether subscription will cancel at period end'
      },
      canceled_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Cancellation request date'
      },
      ended_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Subscription termination date'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional subscription metadata'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Indexes for performance
    await queryInterface.addIndex('subscriptions', ['customer_id'], {
      name: 'subscriptions_customer_id_idx'
    });

    await queryInterface.addIndex('subscriptions', ['provider'], {
      name: 'subscriptions_provider_idx'
    });

    await queryInterface.addIndex('subscriptions', ['provider_subscription_id'], {
      name: 'subscriptions_provider_subscription_id_idx',
      unique: true
    });

    await queryInterface.addIndex('subscriptions', ['status'], {
      name: 'subscriptions_status_idx'
    });

    await queryInterface.addIndex('subscriptions', ['current_period_end'], {
      name: 'subscriptions_current_period_end_idx'
    });

    await queryInterface.addIndex('subscriptions', ['trial_ends_at'], {
      name: 'subscriptions_trial_ends_at_idx'
    });

    await queryInterface.addIndex('subscriptions', ['created_at'], {
      name: 'subscriptions_created_at_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('subscriptions');
  }
};
