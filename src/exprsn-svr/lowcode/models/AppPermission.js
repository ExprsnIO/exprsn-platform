/**
 * AppPermission Model
 * Defines granular permissions for roles
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppPermission = sequelize.define('AppPermission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'app_roles',
        key: 'id'
      }
    },
    resourceType: {
      type: DataTypes.ENUM('application', 'form', 'entity', 'grid', 'card', 'datasource'),
      allowNull: false,
      field: 'resource_type',
      comment: 'Type of resource this permission applies to'
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resource_id',
      comment: 'Specific resource ID, null means all resources of this type'
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Permitted actions: {read: true, write: true, delete: false, etc.}'
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Record-level conditions for dynamic permissions'
    },
    fieldPermissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'field_permissions',
      comment: 'Field-level permissions for entities'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Higher priority permissions override lower ones'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'app_permissions',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['role_id'] },
      { fields: ['resource_type'] },
      { fields: ['resource_id'] },
      { fields: ['resource_type', 'resource_id'] }
    ]
  });

  AppPermission.associate = (models) => {
    AppPermission.belongsTo(models.AppRole, {
      foreignKey: 'roleId',
      as: 'role'
    });
  };

  return AppPermission;
};
