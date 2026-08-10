const sequelize = require('../config/database');
const { logger } = require('@exprsn/shared');

// Import models
const PaymentConfiguration = require('./PaymentConfiguration')(sequelize);
const Transaction = require('./Transaction')(sequelize);
const Customer = require('./Customer')(sequelize);
const Refund = require('./Refund')(sequelize);
const Webhook = require('./Webhook')(sequelize);

// Store models in an object
const models = {
  PaymentConfiguration,
  Transaction,
  Customer,
  Refund,
  Webhook,
  sequelize
};

// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Sync models in development (use migrations in production)
if (process.env.NODE_ENV === 'development' && process.env.AUTO_SYNC === 'true') {
  sequelize.sync({ alter: false })
    .then(() => {
      logger.info('Database models synchronized');
    })
    .catch(err => {
      logger.error('Error synchronizing database models:', err);
    });
}

module.exports = models;
