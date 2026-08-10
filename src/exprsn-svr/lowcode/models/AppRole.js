/**
 * AppRole Model
 * Defines roles within an application for RBAC
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppRole = sequelize.define('AppRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_]*$/
      }
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isSystemRole: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system_role',
      comment: 'System roles cannot be deleted or modified'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Default permissions for this role'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Higher priority roles override lower priority ones'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'app_roles',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['name'] },
      { fields: ['is_system_role'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null }
      }
    ]
  });

  AppRole.associate = (models) => {
    AppRole.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    AppRole.hasMany(models.AppPermission, {
      foreignKey: 'roleId',
      as: 'rolePermissions',
      onDelete: 'CASCADE'
    });

    AppRole.hasMany(models.AppUserRole, {
      foreignKey: 'roleId',
      as: 'userRoles',
      onDelete: 'CASCADE'
    });
  };

  return AppRole;
};
