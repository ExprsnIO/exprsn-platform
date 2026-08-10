/**
 * KBCategory Model
 * Represents a category for organizing knowledge base articles
 */

module.exports = (sequelize, DataTypes) => {
  const KBCategory = sequelize.define('KBCategory', {
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
        model: 'kb_categories',
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
    articleCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'article_count'
    },
    isVisible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      field: 'is_visible'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_categories',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['parent_id'] },
      { fields: ['order'] },
      { fields: ['is_visible'] }
    ]
  });

  KBCategory.associate = (models) => {
    KBCategory.hasMany(models.Article, {
      foreignKey: 'categoryId',
      as: 'articles'
    });

    KBCategory.belongsTo(models.KBCategory, {
      foreignKey: 'parentId',
      as: 'parent'
    });

    KBCategory.hasMany(models.KBCategory, {
      foreignKey: 'parentId',
      as: 'children'
    });
  };

  return KBCategory;
};
