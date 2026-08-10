/**
 * Models Index
 *
 * Loads all Sequelize models and establishes associations.
 * This is the central module for all low-code database models.
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Database configuration
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize({
  dialect: config.database.dialect,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'exprsn_svr',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  pool: config.database.pool,
  logging: config.database.logging,
  define: {
    timestamps: true,
    underscored: true,
  },
});

// Container for all models
const models = {};

// Load all model files
const modelFiles = fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.endsWith('.test.js') &&
      !file.startsWith('_')  // Exclude utility files starting with underscore
    );
  });

// Initialize all models
modelFiles.forEach(file => {
  const required = require(path.join(__dirname, file));

  // Handle both function exports and direct model exports
  let model;
  if (typeof required === 'function') {
    // Function export: call it with sequelize instance
    model = required(sequelize);
  } else if (required && required.name) {
    // Direct model export
    model = required;
  } else {
    // Skip non-model files (like association helpers)
    return;
  }

  models[model.name] = model;
});

// Establish associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Load additional associations from _associations.js
const associationsPath = path.join(__dirname, '_associations.js');
if (fs.existsSync(associationsPath)) {
  const setupAssociations = require(associationsPath);
  setupAssociations(models);
}

// Export models and sequelize instance
module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
