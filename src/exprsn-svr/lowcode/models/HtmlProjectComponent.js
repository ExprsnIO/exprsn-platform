/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Component Model
 * Junction table for project-component relationships
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlProjectComponent = sequelize.define('HtmlProjectComponent', {
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
  componentId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'component_id'
  }
}, {
  tableName: 'html_project_components',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['component_id'] },
    { fields: ['project_id', 'component_id'], unique: true }
  ]
  });

  return HtmlProjectComponent;
};
