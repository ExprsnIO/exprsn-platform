/**
 * ═══════════════════════════════════════════════════════════
 * HTML Library Model
 * External libraries (jQuery, Bootstrap, etc)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlLibrary = sequelize.define('HtmlLibrary', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('css', 'javascript', 'both'),
    allowNull: false,
    defaultValue: 'javascript'
  },
  cdnCssUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cdn_css_url',
    comment: 'CDN URL for CSS file'
  },
  cdnJsUrl: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cdn_js_url',
    comment: 'CDN URL for JavaScript file'
  },
  localCssPath: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'local_css_path',
    comment: 'Local path for CSS file'
  },
  localJsPath: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'local_js_path',
    comment: 'Local path for JavaScript file'
  },
  integrityCss: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'integrity_css',
    comment: 'SRI hash for CSS'
  },
  integrityJs: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'integrity_js',
    comment: 'SRI hash for JavaScript'
  },
  dependencies: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Other libraries this depends on',
    get() {
      const value = this.getDataValue('dependencies');
      return value || [];
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  isPopular: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_popular',
    comment: 'Featured/popular library'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    get() {
      const value = this.getDataValue('metadata');
      return value || {};
    }
  }
}, {
  tableName: 'html_libraries',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['name'], unique: true },
    { fields: ['type'] },
    { fields: ['is_active'] },
    { fields: ['is_popular'] }
  ]
});

  HtmlLibrary.associate = (models) => {
    HtmlLibrary.belongsToMany(models.HtmlProject, {
      through: models.HtmlProjectLibrary,
      foreignKey: 'libraryId',
      otherKey: 'projectId',
      as: 'projects'
    });
  };

  return HtmlLibrary;
};
