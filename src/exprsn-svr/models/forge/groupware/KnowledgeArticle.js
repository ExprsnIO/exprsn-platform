const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KnowledgeArticle = sequelize.define('KnowledgeArticle', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'category_id'
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    contentFormat: {
      type: DataTypes.ENUM('markdown', 'html', 'plaintext'),
      allowNull: false,
      defaultValue: 'markdown',
      field: 'content_format'
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    lastEditedById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'last_edited_by_id'
    },
    lastEditedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_edited_at'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived', 'under_review'),
      allowNull: false,
      defaultValue: 'draft'
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at'
    },
    metaTitle: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'meta_title'
    },
    metaDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'meta_description'
    },
    metaKeywords: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      field: 'meta_keywords'
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'view_count'
    },
    helpfulCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'helpful_count'
    },
    notHelpfulCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'not_helpful_count'
    },
    visibility: {
      type: DataTypes.ENUM('public', 'internal', 'private'),
      allowNull: false,
      defaultValue: 'public'
    },
    requiresAuthentication: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'requires_authentication'
    },
    allowedRoles: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
      field: 'allowed_roles'
    },
    enableComments: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'enable_comments'
    },
    enableFeedback: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'enable_feedback'
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_featured'
    },
    featuredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'featured_at'
    },
    relatedArticleIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
      field: 'related_article_ids'
    },
    searchVector: {
      type: 'TSVECTOR',
      allowNull: true,
      field: 'search_vector'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_articles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['category_id'] },
      { fields: ['author_id'] },
      { fields: ['slug'] },
      { fields: ['status'] },
      { fields: ['visibility'] },
      { fields: ['published_at'] },
      { fields: ['is_featured'] },
      { fields: ['category_id', 'slug'], unique: true }
    ]
  });

  KnowledgeArticle.associate = (models) => {
    KnowledgeArticle.belongsTo(models.KnowledgeCategory, {
      foreignKey: 'categoryId',
      as: 'Category'
    });

    KnowledgeArticle.hasMany(models.KnowledgeArticleVersion, {
      foreignKey: 'articleId',
      as: 'Versions'
    });

    KnowledgeArticle.hasMany(models.KnowledgeArticleAttachment, {
      foreignKey: 'articleId',
      as: 'Attachments'
    });
  };

  return KnowledgeArticle;
};
