const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Location Model - PostGIS-enabled location storage
 * Stores geographic locations with spatial indexing
 */
class Location extends Model {
  /**
   * Calculate distance to another location in meters
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<number>} Distance in meters
   */
  async distanceTo(lat, lng) {
    const [result] = await sequelize.query(`
      SELECT ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
      ) as distance
      FROM locations
      WHERE id = :id
    `, {
      replacements: { id: this.id, lat, lng },
      type: sequelize.QueryTypes.SELECT
    });
    return parseFloat(result.distance);
  }

  /**
   * Check if location is within a radius
   * @param {number} lat - Center latitude
   * @param {number} lng - Center longitude
   * @param {number} radiusMeters - Radius in meters
   * @returns {Promise<boolean>} Is within radius
   */
  async isWithinRadius(lat, lng, radiusMeters) {
    const distance = await this.distanceTo(lat, lng);
    return distance <= radiusMeters;
  }
}

Location.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Location name or label'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // PostGIS geometry column (Point in WGS84)
  location: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: false,
    comment: 'PostGIS point geometry (WGS84)'
  },
  latitude: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: {
      min: -90,
      max: 90
    }
  },
  longitude: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: {
      min: -180,
      max: 180
    }
  },
  altitude: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    comment: 'Altitude/elevation in meters'
  },
  accuracy: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    comment: 'Horizontal accuracy in meters'
  },
  type: {
    type: DataTypes.ENUM(
      'user',
      'group',
      'event',
      'business',
      'landmark',
      'poi',
      'custom'
    ),
    defaultValue: 'custom',
    allowNull: false
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'entity_id',
    comment: 'ID of the associated entity (user, group, event, etc.)'
  },
  address: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structured address data'
  },
  properties: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional location properties'
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'unlisted'),
    defaultValue: 'public',
    allowNull: false
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
  modelName: 'Location',
  tableName: 'locations',
  timestamps: false,
  indexes: [
    {
      name: 'locations_location_idx',
      using: 'GIST',
      fields: ['location']
    },
    { fields: ['type'] },
    { fields: ['entity_id'] },
    { fields: ['visibility'] },
    { fields: ['is_active'] },
    { fields: ['created_by'] }
  ],
  hooks: {
    beforeCreate: (location) => {
      // Ensure location geometry is set from lat/lng
      if (!location.location && location.latitude && location.longitude) {
        location.location = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        };
      }
    },
    beforeUpdate: (location) => {
      // Update geometry if lat/lng changed
      if (location.changed('latitude') || location.changed('longitude')) {
        location.location = {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]
        };
      }
      location.updatedAt = Date.now();
    }
  }
});

module.exports = Location;
