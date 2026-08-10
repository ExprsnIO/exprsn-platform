const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KnowledgeArticleVersion = sequelize.define('KnowledgeArticleVersion', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    articleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'article_id'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false
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
    changeSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'change_summary'
    },
    editedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'edited_by_id'
    },
    diffFromPrevious: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'diff_from_previous'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_article_versions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['article_id'] },
      { fields: ['version'] },
      { fields: ['article_id', 'version'], unique: true }
    ]
  });

  KnowledgeArticleVersion.associate = (models) => {
    KnowledgeArticleVersion.belongsTo(models.KnowledgeArticle, {
      foreignKey: 'articleId',
      as: 'Article'
    });
  };

  return KnowledgeArticleVersion;
};
