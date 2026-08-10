/**
 * Article Model
 * Represents a knowledge base article
 */

module.exports = (sequelize, DataTypes) => {
  const Article = sequelize.define('Article', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    excerpt: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'category_id',
      references: {
        model: 'kb_categories',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
      allowNull: false
    },
    visibility: {
      type: DataTypes.ENUM('public', 'private', 'organization'),
      defaultValue: 'organization',
      allowNull: false
    },
    // Featured article
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: 'is_featured'
    },
    // SEO
    metaTitle: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'meta_title'
    },
    metaDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'meta_description'
    },
    // Analytics
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'view_count'
    },
    likeCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'like_count'
    },
    helpfulCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'helpful_count'
    },
    notHelpfulCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'not_helpful_count'
    },
    // Version tracking
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },
    // Publishing
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at'
    },
    lastEditedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_edited_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Related articles
    relatedArticles: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      field: 'related_articles'
    },
    // Table of contents (auto-generated from headings)
    tableOfContents: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'table_of_contents'
    },
    // Attachments
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_articles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['author_id'] },
      { fields: ['category_id'] },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['is_featured'] },
      { fields: ['published_at'] },
      { fields: ['view_count'] },
      { fields: ['helpful_count'] },
      { fields: ['created_at'] }
    ]
  });

  Article.associate = (models) => {
    Article.belongsTo(models.KBCategory, {
      foreignKey: 'categoryId',
      as: 'category'
    });

    Article.belongsToMany(models.KBTag, {
      through: 'kb_article_tags',
      foreignKey: 'articleId',
      otherKey: 'tagId',
      as: 'tags'
    });

    Article.hasMany(models.ArticleVersion, {
      foreignKey: 'articleId',
      as: 'versions',
      onDelete: 'CASCADE'
    });

    Article.hasMany(models.ArticleView, {
      foreignKey: 'articleId',
      as: 'views',
      onDelete: 'CASCADE'
    });
  };

  return Article;
};
