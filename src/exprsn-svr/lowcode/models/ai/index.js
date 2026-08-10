/**
 * AI Agent Models Index
 *
 * Properly initializes and exports all AI agent-related models.
 * Models are initialized with the main sequelize instance from ../index.js
 */

const fs = require('fs');
const path = require('path');

// Get the sequelize instance from parent models
const { sequelize } = require('../index');

// Container for initialized AI models
const models = {};

// Load all AI model files from this directory
const modelFiles = fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file !== 'index.js' &&
      file.endsWith('.js') &&
      !file.endsWith('.test.js') &&
      !file.startsWith('_')
    );
  });

// Initialize all AI models with the sequelize instance
modelFiles.forEach(file => {
  const modelDefinition = require(path.join(__dirname, file));

  // Call the model definition function with sequelize instance
  if (typeof modelDefinition === 'function') {
    const model = modelDefinition(sequelize);
    models[model.name] = model;
  }
});

// Establish associations between AI models
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Export all initialized models
module.exports = models;
