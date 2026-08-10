/**
 * Share Model
 * Manages sharing permissions for dashboards and reports
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Share = sequelize.define('Share', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    resourceType: {
      type: DataTypes.ENUM('dashboard', 'report', 'visualization', 'query'),
      allowNull: false
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'ID of the shared resource'
    },
    shareType: {
      type: DataTypes.ENUM('user', 'group', 'role', 'public'),
      allowNull: false
    },
    sharedWith: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User, group, or role ID (null for public shares)'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        view: true,
        edit: false,
        delete: false,
        share: false
      }
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Share expiration date (null = never expires)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    accessCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastAccessedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional message to include when sharing'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created this share'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'shares',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['resource_type', 'resource_id'] },
      { fields: ['share_type'] },
      { fields: ['shared_with'] },
      { fields: ['is_active'] },
      { fields: ['expires_at'] },
      { fields: ['created_by'] }
    ]
  });

  return Share;
};
