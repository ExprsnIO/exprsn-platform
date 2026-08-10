/**
 * AppUserRole Model
 * Junction table mapping users to roles within applications
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppUserRole = sequelize.define('AppUserRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User from Auth service'
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
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'app_roles',
        key: 'id'
      }
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_by',
      comment: 'User who assigned this role'
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'assigned_at'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
      comment: 'Optional expiration for temporary role assignments'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'app_user_roles',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['application_id'] },
      { fields: ['role_id'] },
      { fields: ['user_id', 'application_id'] },
      { fields: ['expires_at'] },
      {
        unique: true,
        fields: ['user_id', 'application_id', 'role_id'],
        where: { deleted_at: null }
      }
    ]
  });

  AppUserRole.associate = (models) => {
    AppUserRole.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    AppUserRole.belongsTo(models.AppRole, {
      foreignKey: 'roleId',
      as: 'role'
    });
  };

  return AppUserRole;
};
