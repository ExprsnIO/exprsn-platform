const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Place Model - Points of Interest with PostGIS
 * Stores places, landmarks, businesses, and other POIs
 */
class Place extends Model {}

Place.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // PostGIS geometry
  location: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: false
  },
  latitude: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: { min: -90, max: 90 }
  },
  longitude: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: { min: -180, max: 180 }
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Place category (restaurant, park, etc.)'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  address: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Structured address (street, city, state, zip, country)'
  },
  contact: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Contact information (phone, email, website)'
  },
  hours: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Operating hours by day'
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    defaultValue: null,
    validate: { min: 0, max: 5 }
  },
  ratingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'rating_count'
  },
  photos: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of photo URLs'
  },
  amenities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Available amenities (wifi, parking, etc.)'
  },
  properties: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  claimedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'claimed_by',
    comment: 'User who claimed this place'
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
  modelName: 'Place',
  tableName: 'places',
  timestamps: false,
  indexes: [
    {
      name: 'places_location_idx',
      using: 'GIST',
      fields: ['location']
    },
    { fields: ['slug'], unique: true },
    { fields: ['category'] },
    { fields: ['tags'], using: 'GIN' },
    { fields: ['verified'] },
    { fields: ['visibility'] },
    { fields: ['is_active'] }
  ],
  hooks: {
    beforeCreate: (place) => {
      if (!place.location && place.latitude && place.longitude) {
        place.location = {
          type: 'Point',
          coordinates: [place.longitude, place.latitude]
        };
      }
    },
    beforeUpdate: (place) => {
      if (place.changed('latitude') || place.changed('longitude')) {
        place.location = {
          type: 'Point',
          coordinates: [place.longitude, place.latitude]
        };
      }
      place.updatedAt = Date.now();
    }
  }
});

module.exports = Place;
