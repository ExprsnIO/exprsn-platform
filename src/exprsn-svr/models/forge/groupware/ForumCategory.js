const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ForumCategory = sequelize.define('ForumCategory', {
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
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    forumCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'forum_count'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'forum_categories',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true }
    ]
  });

  ForumCategory.associate = (models) => {
    ForumCategory.hasMany(models.Forum, {
      foreignKey: 'categoryId',
      as: 'Forums'
    });
  };

  return ForumCategory;
};
