const sequelize = require('../config/database');

// Import all models
const Location = require('./Location');
const Place = require('./Place');
const Route = require('./Route');
const Geofence = require('./Geofence');

/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * ═══════════════════════════════════════════════════════════
 */

// Note: Spatial models are intentionally kept loosely coupled
// to allow flexibility across different services

/**
 * ═══════════════════════════════════════════════════════════
 * Export Models
 * ═══════════════════════════════════════════════════════════
 */

module.exports = {
  sequelize,
  Location,
  Place,
  Route,
  Geofence
};
