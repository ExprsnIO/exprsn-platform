/**
 * KBTag Model
 * Represents a tag for knowledge base articles
 */

module.exports = (sequelize, DataTypes) => {
  const KBTag = sequelize.define('KBTag', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    slug: {
      type: DataTypes.STRING(100),
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
    color: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      field: 'usage_count'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'kb_tags',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['name'], unique: true },
      { fields: ['slug'], unique: true },
      { fields: ['usage_count'] }
    ]
  });

  KBTag.associate = (models) => {
    KBTag.belongsToMany(models.Article, {
      through: 'kb_article_tags',
      foreignKey: 'tagId',
      otherKey: 'articleId',
      as: 'articles'
    });
  };

  return KBTag;
};
