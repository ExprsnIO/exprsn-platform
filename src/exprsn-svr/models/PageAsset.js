/**
 * ═══════════════════════════════════════════════════════════
 * PageAsset Model
 * Media files and assets uploaded for pages
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class PageAsset extends Model {
  /**
   * Get asset URL
   */
  getUrl() {
    return `/uploads/${this.file_path}`;
  }

  /**
   * Check if user can access this asset
   */
  canAccess(userId) {
    if (this.is_public) {
      return true;
    }
    if (this.uploaded_by === userId) {
      return true;
    }
    return false;
  }
}

PageAsset.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    uploaded_by: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who uploaded the asset'
    },
    page_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Associated page (null if general asset)'
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Original file name'
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Storage path'
    },
    file_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'MIME type'
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'File size in bytes'
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Image width (if image)'
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Image height (if image)'
    },
    alt_text: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Alternative text for accessibility'
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Asset title'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Asset description'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Search tags'
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Public access without authentication'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata (EXIF, etc.)'
    }
  },
  {
    sequelize,
    modelName: 'PageAsset',
    tableName: 'page_assets',
    indexes: [
      { fields: ['uploaded_by'] },
      { fields: ['page_id'] },
      { fields: ['file_type'] },
      { fields: ['is_public'] }
    ]
  }
);

module.exports = PageAsset;
