/**
 * ═══════════════════════════════════════════════════════════
 * HTML File Version Model
 * Version control for HTML files
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlFileVersion = sequelize.define('HtmlFileVersion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  fileId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'file_id'
  },
  versionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'version_number',
    comment: 'Incremental version number'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Snapshot of file content'
  },
  storagePath: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'storage_path',
    comment: 'Path to versioned file in storage'
  },
  changeDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'change_description',
    comment: 'Description of changes'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
}, {
  tableName: 'html_file_versions',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['file_id'] },
    { fields: ['file_id', 'version_number'], unique: true },
    { fields: ['created_at'] }
  ]
});

  HtmlFileVersion.associate = (models) => {
    HtmlFileVersion.belongsTo(models.HtmlFile, {
      foreignKey: 'fileId',
      as: 'file'
    });
  };

  return HtmlFileVersion;
};
