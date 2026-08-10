/**
 * ═══════════════════════════════════════════════════════════════════════
 * Role Model
 * Represents user roles for access control
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
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
        is: /^[a-z0-9-_]+$/i,
        len: [1, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'System roles cannot be deleted (admin, user, moderator, etc.)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'roles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Parent role for inheritance'
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Higher priority roles override lower priority roles'
    },
    scope: {
      type: DataTypes.ENUM('global', 'service', 'resource'),
      defaultValue: 'global',
      allowNull: false,
      comment: 'global: all services, service: specific service, resource: specific resource'
    },
    scopeValue: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Service name or resource identifier for scoped roles'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Additional metadata (color, icon, display settings, etc.)'
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        inheritsPermissions: true,
        allowMultipleAssignment: true,
        expirationDays: null
      },
      allowNull: false
    },
    userCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0
      },
      comment: 'Cached count of users with this role'
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
    tableName: 'roles',
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
        fields: ['parent_id']
      },
      {
        fields: ['is_system']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['scope']
      },
      {
        fields: ['priority'],
        order: [['priority', 'DESC']]
      },
      {
        fields: ['created_at']
      }
    ],
    hooks: {
      beforeValidate: (role) => {
        // Auto-generate slug from name if not provided
        if (!role.slug && role.name) {
          role.slug = role.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        }
      },
      beforeDestroy: (role) => {
        // Prevent deletion of system roles
        if (role.isSystem) {
          throw new Error('Cannot delete system role');
        }
      }
    }
  });

  Role.associate = (models) => {
    // Self-referencing for role inheritance
    Role.belongsTo(models.Role, {
      as: 'parent',
      foreignKey: 'parentId'
    });

    Role.hasMany(models.Role, {
      as: 'children',
      foreignKey: 'parentId'
    });

    // Many-to-many with permissions through RolePermissions
    Role.belongsToMany(models.Permission, {
      through: models.RolePermission,
      foreignKey: 'roleId',
      otherKey: 'permissionId',
      as: 'permissions'
    });

    // Direct association with RolePermissions
    Role.hasMany(models.RolePermission, {
      foreignKey: 'roleId',
      as: 'rolePermissions'
    });
  };

  /**
   * Get all permissions for this role (including inherited)
   */
  Role.prototype.getAllPermissions = async function() {
    const permissions = await this.getPermissions();

    // If inheritance is enabled and has parent, get parent permissions
    if (this.settings.inheritsPermissions && this.parentId) {
      const parent = await Role.findByPk(this.parentId);
      if (parent) {
        const parentPermissions = await parent.getAllPermissions();
        // Merge permissions (child overrides parent if duplicate)
        const permissionMap = new Map();
        parentPermissions.forEach(p => permissionMap.set(p.id, p));
        permissions.forEach(p => permissionMap.set(p.id, p));
        return Array.from(permissionMap.values());
      }
    }

    return permissions;
  };

  /**
   * Check if role has a specific permission
   */
  Role.prototype.hasPermission = async function(permissionSlug) {
    const permissions = await this.getAllPermissions();
    return permissions.some(p => p.slug === permissionSlug);
  };

  /**
   * Get all ancestor roles
   */
  Role.prototype.getAncestors = async function() {
    if (!this.parentId) return [];

    const ancestors = [];
    let currentId = this.parentId;

    while (currentId) {
      const parent = await Role.findByPk(currentId);
      if (!parent) break;

      ancestors.unshift(parent);
      currentId = parent.parentId;
    }

    return ancestors;
  };

  return Role;
};
