/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Timeline - Trending Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Trending = sequelize.define('Trending', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    topic: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true
    },
    topicType: {
      type: DataTypes.ENUM('hashtag', 'keyword', 'user'),
      defaultValue: 'hashtag',
      field: 'topic_type'
    },
    postsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'posts_count'
    },
    engagementCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'engagement_count'
    },
    trendScore: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      field: 'trend_score'
    },
    peakAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'peak_at'
    }
  }, {
    tableName: 'trending',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['topic'] },
      { fields: ['trend_score'] },
      { fields: ['topic_type'] },
      { fields: ['peak_at'] }
    ]
  });

  return Trending;
};
