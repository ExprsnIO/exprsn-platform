/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Database Models Index
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config/database');
const logger = require('../utils/logger');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
    define: config.define
  }
);

// Import models
const File = require('./File')(sequelize, Sequelize.DataTypes);
const FileVersion = require('./FileVersion')(sequelize, Sequelize.DataTypes);
const Directory = require('./Directory')(sequelize, Sequelize.DataTypes);
const ShareLink = require('./ShareLink')(sequelize, Sequelize.DataTypes);
const FileBlob = require('./FileBlob')(sequelize, Sequelize.DataTypes);
const Thumbnail = require('./Thumbnail')(sequelize, Sequelize.DataTypes);
const Download = require('./Download')(sequelize, Sequelize.DataTypes);
const StorageQuota = require('./StorageQuota')(sequelize, Sequelize.DataTypes);

// Define models object
const models = {
  File,
  FileVersion,
  Directory,
  ShareLink,
  FileBlob,
  Thumbnail,
  Download,
  StorageQuota,
  sequelize,
  Sequelize
};

// Set up associations
Object.values(models)
  .filter(model => typeof model.associate === 'function')
  .forEach(model => model.associate(models));

module.exports = models;
