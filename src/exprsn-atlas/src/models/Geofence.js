const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Geofence Model - PostGIS Polygon for geofencing
 * Stores geographic boundaries for geofencing applications
 */
class Geofence extends Model {
  /**
   * Check if a point is within this geofence
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<boolean>} Is within geofence
   */
  async containsPoint(lat, lng) {
    const [result] = await sequelize.query(`
      SELECT ST_Contains(
        boundary,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
      ) as contains
      FROM geofences
      WHERE id = :id
    `, {
      replacements: { id: this.id, lat, lng },
      type: sequelize.QueryTypes.SELECT
    });
    return result.contains;
  }

  /**
   * Get area in square meters
   * @returns {Promise<number>} Area in square meters
   */
  async getAreaSquareMeters() {
    const [result] = await sequelize.query(`
      SELECT ST_Area(boundary::geography) as area
      FROM geofences
      WHERE id = :id
    `, {
      replacements: { id: this.id },
      type: sequelize.QueryTypes.SELECT
    });
    return parseFloat(result.area);
  }
}

Geofence.init({
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
  // PostGIS Polygon geometry
  boundary: {
    type: DataTypes.GEOMETRY('POLYGON', 4326),
    allowNull: false,
    comment: 'PostGIS polygon boundary'
  },
  type: {
    type: DataTypes.ENUM(
      'circular',
      'rectangular',
      'polygon',
      'custom'
    ),
    defaultValue: 'polygon'
  },
  center: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: true,
    comment: 'Center point for circular geofences'
  },
  radiusMeters: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    field: 'radius_meters',
    comment: 'Radius in meters (for circular geofences)'
  },
  purpose: {
    type: DataTypes.ENUM(
      'security',
      'notification',
      'tracking',
      'restriction',
      'analytics',
      'custom'
    ),
    defaultValue: 'custom'
  },
  entityType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'entity_type',
    comment: 'Type of entity this geofence is for (group, event, user, etc.)'
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id',
    comment: 'ID of associated entity'
  },
  triggers: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Trigger configuration (onEntry, onExit, onDwell)'
  },
  properties: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'expires_at',
    comment: 'Optional expiration timestamp'
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
  modelName: 'Geofence',
  tableName: 'geofences',
  timestamps: false,
  indexes: [
    {
      name: 'geofences_boundary_idx',
      using: 'GIST',
      fields: ['boundary']
    },
    {
      name: 'geofences_center_idx',
      using: 'GIST',
      fields: ['center']
    },
    { fields: ['type'] },
    { fields: ['purpose'] },
    { fields: ['entity_type'] },
    { fields: ['entity_id'] },
    { fields: ['is_active'] },
    { fields: ['expires_at'] }
  ],
  hooks: {
    beforeUpdate: (geofence) => {
      geofence.updatedAt = Date.now();
    }
  }
});

module.exports = Geofence;
