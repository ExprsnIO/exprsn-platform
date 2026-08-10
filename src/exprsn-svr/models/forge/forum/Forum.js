/**
 * Forum Model
 * Represents a forum category/board
 */

module.exports = (sequelize, DataTypes) => {
  const Forum = sequelize.define('Forum', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_id',
      references: {
        model: 'forums',
        key: 'id'
      }
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    // Statistics
    topicCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'topic_count'
    },
    postCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'post_count'
    },
    // Last activity
    lastTopicId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_topic_id',
      references: {
        model: 'forum_topics',
        key: 'id'
      }
    },
    lastPostId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_post_id',
      references: {
        model: 'forum_posts',
        key: 'id'
      }
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_activity_at'
    },
    // Visibility and permissions
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'organization'),
      defaultValue: 'organization',
      allowNull: false
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: 'is_locked'
    },
    // Permissions (JSONB for flexible role-based access)
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: {
        view: ['all'],
        createTopic: ['member'],
        reply: ['member'],
        moderate: ['moderator', 'admin']
      }
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'forums',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['parent_id'] },
      { fields: ['order'] },
      { fields: ['visibility'] },
      { fields: ['last_activity_at'] }
    ]
  });

  Forum.associate = (models) => {
    Forum.hasMany(models.Topic, {
      foreignKey: 'forumId',
      as: 'topics'
    });

    Forum.belongsTo(models.Forum, {
      foreignKey: 'parentId',
      as: 'parent'
    });

    Forum.hasMany(models.Forum, {
      foreignKey: 'parentId',
      as: 'children'
    });
  };

  return Forum;
};
