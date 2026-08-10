/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Snapshot Model
 * Point-in-time snapshots of entire projects
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlProjectSnapshot = sequelize.define('HtmlProjectSnapshot', {
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  snapshotData: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'snapshot_data',
    comment: 'Complete project state',
    get() {
      const value = this.getDataValue('snapshotData');
      return value || {};
    }
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  }
}, {
  tableName: 'html_project_snapshots',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['project_id'] },
    { fields: ['created_at'] }
  ]
});

  HtmlProjectSnapshot.associate = (models) => {
    HtmlProjectSnapshot.belongsTo(models.HtmlProject, {
      foreignKey: 'projectId',
      as: 'project'
    });

    HtmlProjectSnapshot.hasMany(models.HtmlProjectDeployment, {
      foreignKey: 'snapshotId',
      as: 'deployments'
    });
  };

  return HtmlProjectSnapshot;
};
