/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Configuration Index
 * ═══════════════════════════════════════════════════════════════════════
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

// Import configuration modules
const app = require('./app');
const database = require('./database');
const storage = require('./storage');
const cache = require('./cache');
const ca = require('./ca');

// Aggregate configuration
const config = {
  app,
  database,
  storage,
  redis: cache,
  cache,
  ca
};

module.exports = config;
