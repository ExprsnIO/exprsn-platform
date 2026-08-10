/**
 * ═══════════════════════════════════════════════════════════════════════
 * RolePermission Model
 * Junction table for roles and permissions
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RolePermission = sequelize.define('RolePermission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    permissionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'permissions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    granted: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'true = grant permission, false = explicitly deny permission'
    },
    conditions: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Optional conditions for conditional permissions (time-based, resource-based, etc.)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'role_permissions',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      {
        fields: ['role_id', 'permission_id'],
        unique: true,
        name: 'role_permissions_role_permission_unique'
      },
      {
        fields: ['role_id']
      },
      {
        fields: ['permission_id']
      },
      {
        fields: ['granted']
      }
    ]
  });

  RolePermission.associate = (models) => {
    RolePermission.belongsTo(models.Role, {
      foreignKey: 'roleId',
      as: 'role'
    });

    RolePermission.belongsTo(models.Permission, {
      foreignKey: 'permissionId',
      as: 'permission'
    });
  };

  /**
   * Check if conditions are met
   */
  RolePermission.prototype.conditionsMet = function(context = {}) {
    if (!this.conditions || Object.keys(this.conditions).length === 0) {
      return true;
    }

    // Time-based conditions
    if (this.conditions.timeRange) {
      const now = new Date();
      const start = new Date(this.conditions.timeRange.start);
      const end = new Date(this.conditions.timeRange.end);
      if (now < start || now > end) return false;
    }

    // Resource-based conditions
    if (this.conditions.resourceIds && context.resourceId) {
      if (!this.conditions.resourceIds.includes(context.resourceId)) {
        return false;
      }
    }

    // IP-based conditions
    if (this.conditions.allowedIPs && context.ip) {
      if (!this.conditions.allowedIPs.includes(context.ip)) {
        return false;
      }
    }

    // Custom condition function
    if (this.conditions.custom && typeof this.conditions.custom === 'function') {
      return this.conditions.custom(context);
    }

    return true;
  };

  return RolePermission;
};
