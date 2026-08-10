/**
 * AppUser Model
 * Represents users within a Low-Code application
 * Can reference external auth users or be standalone
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppUser = sequelize.define('AppUser', {
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
    externalUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'external_user_id',
      comment: 'Reference to exprsn-auth user ID if applicable'
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'display_name'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      allowNull: false,
      defaultValue: 'active'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Custom fields and application-specific data'
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at'
    }
  }, {
    tableName: 'app_users',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['external_user_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      {
        unique: true,
        fields: ['application_id', 'username'],
        where: { deleted_at: null }
      },
      {
        unique: true,
        fields: ['application_id', 'email'],
        where: { deleted_at: null }
      }
    ]
  });

  AppUser.associate = (models) => {
    AppUser.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    AppUser.hasMany(models.AppUserRole, {
      foreignKey: 'userId',
      as: 'userRoles',
      onDelete: 'CASCADE'
    });

    AppUser.belongsToMany(models.AppRole, {
      through: models.AppUserRole,
      foreignKey: 'userId',
      otherKey: 'roleId',
      as: 'roles'
    });

    AppUser.belongsToMany(models.AppGroup, {
      through: 'app_user_groups',
      foreignKey: 'userId',
      otherKey: 'groupId',
      as: 'groups'
    });
  };

  // Instance methods
  AppUser.prototype.hasRole = async function(roleName) {
    const roles = await this.getRoles();
    return roles.some(role => role.name === roleName);
  };

  AppUser.prototype.hasPermission = async function(permissionName) {
    const roles = await this.getRoles({
      include: [{
        model: sequelize.models.AppPermission,
        as: 'rolePermissions',
        where: { name: permissionName },
        required: false
      }]
    });

    return roles.some(role =>
      role.rolePermissions && role.rolePermissions.length > 0
    );
  };

  AppUser.prototype.updateLastLogin = async function() {
    this.lastLoginAt = new Date();
    return await this.save();
  };

  return AppUser;
};
