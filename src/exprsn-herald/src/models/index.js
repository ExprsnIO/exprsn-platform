/**
 * Exprsn Herald - Database Models Index
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  username: config.database.username,
  password: config.database.password,
  dialect: 'postgres',
  logging: config.env === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Import models
const Notification = require('./Notification')(sequelize);
const NotificationPreference = require('./NotificationPreference')(sequelize);
const NotificationTemplate = require('./NotificationTemplate')(sequelize);
const DeliveryLog = require('./DeliveryLog')(sequelize);
const PushToken = require('./PushToken')(sequelize);

// Define associations
Notification.hasMany(DeliveryLog, {
  foreignKey: 'notificationId',
  as: 'deliveryLogs'
});

DeliveryLog.belongsTo(Notification, {
  foreignKey: 'notificationId',
  as: 'notification'
});

// Export models and sequelize instance
module.exports = {
  sequelize,
  Notification,
  NotificationPreference,
  NotificationTemplate,
  DeliveryLog,
  PushToken
};
