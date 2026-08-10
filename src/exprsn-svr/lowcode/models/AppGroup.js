/**
 * AppGroup Model
 * Represents groups of users within a Low-Code application
 * Supports hierarchical group structures
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppGroup = sequelize.define('AppGroup', {
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
        is: /^[a-zA-Z][a-zA-Z0-9_-]*$/
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
    parentGroupId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_group_id',
      references: {
        model: 'app_groups',
        key: 'id'
      }
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    memberCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'member_count',
      comment: 'Cached count of direct members'
    }
  }, {
    tableName: 'app_groups',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['parent_group_id'] },
      {
        unique: true,
        fields: ['application_id', 'name'],
        where: { deleted_at: null }
      }
    ]
  });

  AppGroup.associate = (models) => {
    AppGroup.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    // Self-referential for hierarchy
    AppGroup.belongsTo(AppGroup, {
      foreignKey: 'parentGroupId',
      as: 'parentGroup'
    });

    AppGroup.hasMany(AppGroup, {
      foreignKey: 'parentGroupId',
      as: 'childGroups'
    });

    // Many-to-many with users
    AppGroup.belongsToMany(models.AppUser, {
      through: 'app_user_groups',
      foreignKey: 'groupId',
      otherKey: 'userId',
      as: 'members'
    });
  };

  // Instance methods
  AppGroup.prototype.addMember = async function(userId) {
    const AppUserGroup = sequelize.models.AppUserGroup || sequelize.define('AppUserGroup', {
      userId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      groupId: {
        type: DataTypes.UUID,
        allowNull: false
      }
    }, { tableName: 'app_user_groups' });

    await AppUserGroup.create({
      userId,
      groupId: this.id
    });

    this.memberCount += 1;
    return await this.save();
  };

  AppGroup.prototype.removeMember = async function(userId) {
    const AppUserGroup = sequelize.models.AppUserGroup || sequelize.define('AppUserGroup', {
      userId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      groupId: {
        type: DataTypes.UUID,
        allowNull: false
      }
    }, { tableName: 'app_user_groups' });

    await AppUserGroup.destroy({
      where: {
        userId,
        groupId: this.id
      }
    });

    if (this.memberCount > 0) {
      this.memberCount -= 1;
    }
    return await this.save();
  };

  AppGroup.prototype.getAncestors = async function() {
    const ancestors = [];
    let current = this;

    while (current.parentGroupId) {
      current = await AppGroup.findByPk(current.parentGroupId);
      if (current) {
        ancestors.push(current);
      } else {
        break;
      }
    }

    return ancestors;
  };

  AppGroup.prototype.getDescendants = async function() {
    const descendants = [];
    const children = await this.getChildGroups();

    for (const child of children) {
      descendants.push(child);
      const childDescendants = await child.getDescendants();
      descendants.push(...childDescendants);
    }

    return descendants;
  };

  return AppGroup;
};
