/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Library Model
 * Junction table for project-library relationships
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlProjectLibrary = sequelize.define('HtmlProjectLibrary', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  projectId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'project_id'
  },
  libraryId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'library_id'
  },
  loadOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'load_order',
    comment: 'Order in which to load libraries'
  },
  isEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_enabled'
  }
}, {
  tableName: 'html_project_libraries',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['library_id'] },
    { fields: ['project_id', 'library_id'], unique: true }
  ]
  });

  return HtmlProjectLibrary;
};
