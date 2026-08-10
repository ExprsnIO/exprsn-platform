/**
 * ═══════════════════════════════════════════════════════════
 * Sequelize Models Index
 * Initializes Sequelize models and associations
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database');
const logger = require('../src/utils/logger');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging ? (msg) => logger.debug(msg) : false,
    pool: {
      max: dbConfig.pool?.max || 10,
      min: dbConfig.pool?.min || 2,
      acquire: dbConfig.pool?.acquire || 30000,
      idle: dbConfig.pool?.idle || 10000
    },
    define: {
      timestamps: true,
      underscored: true
    }
  }
);

// Test connection
sequelize
  .authenticate()
  .then(() => {
    logger.info('Database connection established successfully');
  })
  .catch((err) => {
    logger.error('Unable to connect to database', { error: err.message });
  });

// Initialize models
const models = {
  ModerationCase: require('./ModerationCase')(sequelize),
  ModerationRule: require('./ModerationRule')(sequelize),
  ModerationAction: require('./ModerationAction')(sequelize),
  Report: require('./Report')(sequelize),
  ReviewQueue: require('./ReviewQueue')(sequelize),
  UserAction: require('./UserAction')(sequelize),
  Appeal: require('./Appeal')(sequelize),
  AIAgent: require('./AIAgent')(sequelize),
  AgentExecution: require('./AgentExecution')(sequelize),
  EmailTemplate: require('./EmailTemplate')(sequelize),
  EmailLog: require('./EmailLog')(sequelize),
  ModeratorConfig: require('./ModeratorConfig')(sequelize),
  RateLimitViolation: require('./RateLimitViolation')(sequelize)
};

// Set up associations
Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Export models and sequelize instance
module.exports = {
  sequelize,
  Sequelize,
  ...models
};
