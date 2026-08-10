const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KnowledgeCategory = sequelize.define('KnowledgeCategory', {
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
      allowNull: true,
      defaultValue: '#3788d8'
    },
    parentCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_category_id'
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    articleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'article_count'
    },
    visibility: {
      type: DataTypes.ENUM('public', 'internal', 'private'),
      allowNull: false,
      defaultValue: 'public'
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_archived'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_categories',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['parent_category_id'] },
      { fields: ['visibility'] },
      { fields: ['is_archived'] }
    ]
  });

  KnowledgeCategory.associate = (models) => {
    // Self-referential association for parent/child categories
    KnowledgeCategory.belongsTo(models.KnowledgeCategory, {
      as: 'ParentCategory',
      foreignKey: 'parentCategoryId'
    });
    KnowledgeCategory.hasMany(models.KnowledgeCategory, {
      as: 'SubCategories',
      foreignKey: 'parentCategoryId'
    });

    // Articles in this category
    KnowledgeCategory.hasMany(models.KnowledgeArticle, {
      foreignKey: 'categoryId',
      as: 'Articles'
    });
  };

  return KnowledgeCategory;
};
