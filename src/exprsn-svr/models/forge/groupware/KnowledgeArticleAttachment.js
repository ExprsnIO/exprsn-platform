const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const KnowledgeArticleAttachment = sequelize.define('KnowledgeArticleAttachment', {
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
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_filename'
    },
    filePath: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      field: 'file_path'
    },
    fileType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'file_type'
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size'
    },
    uploadedById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'uploaded_by_id'
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'download_count'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_article_attachments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['article_id'] }
    ]
  });

  KnowledgeArticleAttachment.associate = (models) => {
    KnowledgeArticleAttachment.belongsTo(models.KnowledgeArticle, {
      foreignKey: 'articleId',
      as: 'Article'
    });
  };

  return KnowledgeArticleAttachment;
};
