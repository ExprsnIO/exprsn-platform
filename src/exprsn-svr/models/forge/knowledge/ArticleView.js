/**
 * ArticleView Model
 * Tracks views/reads of knowledge base articles
 */

module.exports = (sequelize, DataTypes) => {
  const ArticleView = sequelize.define('ArticleView', {
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
    viewedBy: {
      type: DataTypes.UUID,
      allowNull: true,  // Null for anonymous views
      field: 'viewed_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    // Time spent reading (in seconds)
    timeSpent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'time_spent'
    },
    // Helpful feedback
    wasHelpful: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'was_helpful'
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Referrer
    referrer: {
      type: DataTypes.STRING(1000),
      allowNull: true
    }
  }, {
    tableName: 'kb_article_views',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['article_id'] },
      { fields: ['viewed_by'] },
      { fields: ['created_at'] },
      { fields: ['was_helpful'] }
    ]
  });

  ArticleView.associate = (models) => {
    ArticleView.belongsTo(models.Article, {
      foreignKey: 'articleId',
      as: 'article'
    });
  };

  return ArticleView;
};
