/**
 * ═══════════════════════════════════════════════════════════════════════
 * GroupMember Model
 * Junction table for users and groups with role assignments
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GroupMember = sequelize.define('GroupMember', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'groups',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User ID from exprsn-auth service'
    },
    role: {
      type: DataTypes.ENUM('owner', 'admin', 'moderator', 'member', 'guest'),
      defaultValue: 'member',
      allowNull: false,
      comment: 'owner: full control, admin: manage members, moderator: manage content, member: standard access, guest: limited access'
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'invited', 'suspended'),
      defaultValue: 'active',
      allowNull: false
    },
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Group-specific permissions override (optional)'
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User ID who invited this member'
    },
    invitedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User ID who approved membership'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Optional expiration for temporary memberships'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Additional metadata (title, department, custom fields, etc.)'
    }
  }, {
    tableName: 'group_members',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['group_id', 'user_id'],
        unique: true,
        name: 'group_members_group_user_unique'
      },
      {
        fields: ['group_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['role']
      },
      {
        fields: ['status']
      },
      {
        fields: ['joined_at']
      },
      {
        fields: ['expires_at']
      }
    ],
    hooks: {
      afterCreate: async (membership) => {
        // Increment group member count
        await sequelize.models.Group.increment('memberCount', {
          by: 1,
          where: { id: membership.groupId }
        });
      },
      afterDestroy: async (membership) => {
        // Decrement group member count
        await sequelize.models.Group.decrement('memberCount', {
          by: 1,
          where: { id: membership.groupId }
        });
      }
    }
  });

  GroupMember.associate = (models) => {
    GroupMember.belongsTo(models.Group, {
      foreignKey: 'groupId',
      as: 'group'
    });

    // Note: User model is in exprsn-auth, so we won't have a direct association
    // We'll handle user data via API calls to exprsn-auth
  };

  /**
   * Check if membership is expired
   */
  GroupMember.prototype.isExpired = function() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  };

  /**
   * Check if user has permission level
   */
  GroupMember.prototype.hasPermission = function(permission) {
    // Role-based permission hierarchy
    const rolePermissions = {
      owner: ['read', 'write', 'delete', 'admin', 'manage_members', 'manage_settings'],
      admin: ['read', 'write', 'delete', 'manage_members'],
      moderator: ['read', 'write', 'delete'],
      member: ['read', 'write'],
      guest: ['read']
    };

    const permissions = rolePermissions[this.role] || [];

    // Check custom permissions override
    if (this.permissions && this.permissions[permission] !== undefined) {
      return this.permissions[permission];
    }

    return permissions.includes(permission);
  };

  return GroupMember;
};
