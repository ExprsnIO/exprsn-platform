/**
 * ═══════════════════════════════════════════════════════════════════════
 * Group Model
 * Represents organizational groups for access control and user organization
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Group = sequelize.define('Group', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
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
        is: /^[a-z0-9-]+$/i,
        len: [1, 100]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'groups',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    level: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0
      },
      comment: 'Hierarchy level (0 = root, 1 = first level, etc.)'
    },
    path: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Materialized path for hierarchical queries (e.g., /parent/child/grandchild)'
    },
    type: {
      type: DataTypes.ENUM('organization', 'department', 'team', 'project', 'custom'),
      defaultValue: 'custom',
      allowNull: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'hidden'),
      defaultValue: 'private',
      allowNull: false,
      comment: 'public: visible to all, private: visible to members, hidden: visible to admins only'
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
      comment: 'Additional custom metadata (avatar, color, settings, etc.)'
    },
    memberCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0
      }
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {
        allowMemberInvites: false,
        requireApproval: true,
        maxMembers: null
      },
      allowNull: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User ID who created the group'
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User ID who last updated the group'
    }
  }, {
    tableName: 'groups',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['slug'],
        unique: true
      },
      {
        fields: ['parent_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['visibility']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['path'],
        using: 'btree'
      },
      {
        fields: ['created_at']
      }
    ],
    hooks: {
      beforeValidate: (group) => {
        // Auto-generate slug from name if not provided
        if (!group.slug && group.name) {
          group.slug = group.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        }
      },
      beforeSave: async (group) => {
        // Update level and path based on parent
        if (group.changed('parentId')) {
          if (group.parentId) {
            const parent = await sequelize.models.Group.findByPk(group.parentId);
            if (parent) {
              group.level = parent.level + 1;
              group.path = `${parent.path}/${group.slug}`;
            }
          } else {
            group.level = 0;
            group.path = `/${group.slug}`;
          }
        } else if (!group.path) {
          group.path = `/${group.slug}`;
        }
      }
    }
  });

  Group.associate = (models) => {
    // Self-referencing for hierarchy
    Group.belongsTo(models.Group, {
      as: 'parent',
      foreignKey: 'parentId'
    });

    Group.hasMany(models.Group, {
      as: 'children',
      foreignKey: 'parentId'
    });

    // Many-to-many with users through GroupMembers
    Group.belongsToMany(models.User, {
      through: models.GroupMember,
      foreignKey: 'groupId',
      otherKey: 'userId',
      as: 'members'
    });

    // Direct association with GroupMembers for role queries
    Group.hasMany(models.GroupMember, {
      foreignKey: 'groupId',
      as: 'memberships'
    });
  };

  /**
   * Get group with all ancestors
   */
  Group.prototype.getAncestors = async function() {
    if (!this.parentId) return [];

    const ancestors = [];
    let currentId = this.parentId;

    while (currentId) {
      const parent = await Group.findByPk(currentId);
      if (!parent) break;

      ancestors.unshift(parent);
      currentId = parent.parentId;
    }

    return ancestors;
  };

  /**
   * Get group with all descendants
   */
  Group.prototype.getDescendants = async function() {
    const descendants = [];
    const children = await Group.findAll({ where: { parentId: this.id } });

    for (const child of children) {
      descendants.push(child);
      const childDescendants = await child.getDescendants();
      descendants.push(...childDescendants);
    }

    return descendants;
  };

  /**
   * Check if user is member of group
   */
  Group.prototype.hasMember = async function(userId) {
    const count = await sequelize.models.GroupMember.count({
      where: {
        groupId: this.id,
        userId
      }
    });

    return count > 0;
  };

  /**
   * Get member role in group
   */
  Group.prototype.getMemberRole = async function(userId) {
    const membership = await sequelize.models.GroupMember.findOne({
      where: {
        groupId: this.id,
        userId
      }
    });

    return membership ? membership.role : null;
  };

  return Group;
};
