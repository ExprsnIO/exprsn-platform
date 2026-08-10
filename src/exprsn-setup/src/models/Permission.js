/**
 * ═══════════════════════════════════════════════════════════════════════
 * Permission Model
 * Represents granular permissions for access control
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Permission = sequelize.define('Permission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        len: [1, 100],
        notEmpty: true
      }
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-_:]+$/i,
        len: [1, 100]
      },
      comment: 'Format: service:action or resource:action (e.g., timeline:write, users:delete)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Grouping category (e.g., timeline, users, admin, content)'
    },
    service: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Associated Exprsn service (timeline, auth, spark, etc.)'
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Action type (read, write, delete, admin, execute, etc.)'
    },
    resource: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Specific resource this permission applies to'
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'System permissions cannot be deleted'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Additional metadata (icon, color, display settings, etc.)'
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['name'],
        unique: true
      },
      {
        fields: ['slug'],
        unique: true
      },
      {
        fields: ['category']
      },
      {
        fields: ['service']
      },
      {
        fields: ['action']
      },
      {
        fields: ['is_system']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['created_at']
      }
    ],
    hooks: {
      beforeValidate: (permission) => {
        // Auto-generate slug from service:action if not provided
        if (!permission.slug && permission.service && permission.action) {
          permission.slug = `${permission.service}:${permission.action}`;
        }

        // Extract service and action from slug if provided
        if (permission.slug && !permission.action) {
          const parts = permission.slug.split(':');
          if (parts.length === 2) {
            permission.service = parts[0];
            permission.action = parts[1];
          }
        }
      },
      beforeDestroy: (permission) => {
        // Prevent deletion of system permissions
        if (permission.isSystem) {
          throw new Error('Cannot delete system permission');
        }
      }
    }
  });

  Permission.associate = (models) => {
    // Many-to-many with roles through RolePermissions
    Permission.belongsToMany(models.Role, {
      through: models.RolePermission,
      foreignKey: 'permissionId',
      otherKey: 'roleId',
      as: 'roles'
    });

    // Direct association with RolePermissions
    Permission.hasMany(models.RolePermission, {
      foreignKey: 'permissionId',
      as: 'rolePermissions'
    });
  };

  /**
   * Check if permission matches a pattern
   */
  Permission.prototype.matches = function(pattern) {
    // Exact match
    if (this.slug === pattern) return true;

    // Wildcard match (e.g., timeline:* matches timeline:write, timeline:read)
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return this.slug.startsWith(prefix + ':');
    }

    // Wildcard match (e.g., *:write matches timeline:write, users:write)
    if (pattern.startsWith('*:')) {
      const suffix = pattern.slice(2);
      return this.slug.endsWith(':' + suffix);
    }

    return false;
  };

  return Permission;
};
