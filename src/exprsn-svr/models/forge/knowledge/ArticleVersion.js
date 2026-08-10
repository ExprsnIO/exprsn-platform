/**
 * ArticleVersion Model
 * Stores version history for knowledge base articles
 */

module.exports = (sequelize, DataTypes) => {
  const ArticleVersion = sequelize.define('ArticleVersion', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    articleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'article_id',
      references: {
        model: 'kb_articles',
        key: 'id'
      }
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
    excerpt: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    editedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'edited_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    changeLog: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'change_log'
    },
    // Snapshot of metadata at this version
    snapshot: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_article_versions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['article_id'] },
      { fields: ['version'] },
      { fields: ['article_id', 'version'], unique: true },
      { fields: ['edited_by'] },
      { fields: ['created_at'] }
    ]
  });

  ArticleVersion.associate = (models) => {
    ArticleVersion.belongsTo(models.Article, {
      foreignKey: 'articleId',
      as: 'article'
    });
  };

  return ArticleVersion;
};
