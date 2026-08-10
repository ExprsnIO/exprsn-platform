const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Route Model - PostGIS LineString for routes/paths
 * Stores routes, trails, driving directions, etc.
 */
class Route extends Model {}

Route.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // PostGIS LineString geometry
  path: {
    type: DataTypes.GEOMETRY('LINESTRING', 4326),
    allowNull: false,
    comment: 'PostGIS LineString representing the route'
  },
  waypoints: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of waypoint objects [{lat, lng, name, order}]'
  },
  type: {
    type: DataTypes.ENUM('driving', 'walking', 'cycling', 'transit', 'custom'),
    defaultValue: 'custom'
  },
  distanceMeters: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'distance_meters',
    comment: 'Total route distance in meters'
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'duration_seconds',
    comment: 'Estimated duration in seconds'
  },
  elevationGainMeters: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'elevation_gain_meters'
  },
  elevationLossMeters: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'elevation_loss_meters'
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'moderate', 'difficult', 'expert'),
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  properties: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional route properties (surface, conditions, etc.)'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'unlisted'),
    defaultValue: 'public'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'Route',
  tableName: 'routes',
  timestamps: false,
  indexes: [
    {
      name: 'routes_path_idx',
      using: 'GIST',
      fields: ['path']
    },
    { fields: ['type'] },
    { fields: ['visibility'] },
    { fields: ['is_active'] },
    { fields: ['created_by'] }
  ],
  hooks: {
    beforeUpdate: (route) => {
      route.updatedAt = Date.now();
    }
  }
});

module.exports = Route;
