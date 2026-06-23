/**
 * ═══════════════════════════════════════════════════════════
 * atproto — Sequelize models index
 *
 * Single Sequelize instance pinned to the `atproto` Postgres schema. Exported as
 * { sequelize, Sequelize, ...models } so scripts/sync-one.js (migrate-sync) can
 * discover the instance and create the tables in this schema.
 * ═══════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database');
const logger = require('../utils/logger');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

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
      idle: dbConfig.pool?.idle || 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      // platform: tables namespaced under the 'atproto' schema
      schema: 'atproto',
    },
  }
);

const models = {
  Label: require('./Label')(sequelize),
  FirehoseCursor: require('./FirehoseCursor')(sequelize),
  LabelerIdentity: require('./LabelerIdentity')(sequelize),
  UriCaseMap: require('./UriCaseMap')(sequelize),
  InboundLabel: require('./InboundLabel')(sequelize),
  ExternalLabeler: require('./ExternalLabeler')(sequelize),
  UserDid: require('./UserDid')(sequelize),
};

Object.keys(models).forEach((name) => {
  if (typeof models[name].associate === 'function') {
    models[name].associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
