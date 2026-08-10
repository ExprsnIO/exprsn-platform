/**
 * ═══════════════════════════════════════════════════════════
 * HTML Data Source Model
 * External data connections (JSONLex, Bridge, Forge, APIs)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlDataSource = sequelize.define('HtmlDataSource', {
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
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  type: {
    type: DataTypes.ENUM('jsonlex', 'bridge', 'forge_crm', 'forge_erp', 'forge_groupware', 'rest_api', 'graphql', 'websocket'),
    allowNull: false
  },
  configuration: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Connection configuration',
    get() {
      const value = this.getDataValue('configuration');
      return value || {};
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
}, {
  tableName: 'html_data_sources',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['type'] },
    { fields: ['is_active'] }
  ]
});

  HtmlDataSource.associate = (models) => {
    HtmlDataSource.belongsTo(models.HtmlProject, {
      foreignKey: 'projectId',
      as: 'project'
    });
  };

  return HtmlDataSource;
};
