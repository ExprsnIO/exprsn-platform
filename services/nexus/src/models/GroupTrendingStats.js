const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GroupTrendingStats Model
 *
 * Tracks metrics and statistics for trending group calculations.
 * Updated periodically to calculate trending scores based on activity, growth, and engagement.
 */
class GroupTrendingStats extends Model {}

GroupTrendingStats.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // Membership metrics
  memberCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'member_count'
  },
  memberGrowth24h: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'member_growth_24h',
    comment: 'New members in last 24 hours'
  },
  memberGrowth7d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'member_growth_7d',
    comment: 'New members in last 7 days'
  },
  memberGrowth30d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'member_growth_30d',
    comment: 'New members in last 30 days'
  },
  // Activity metrics
  activeMembers24h: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'active_members_24h',
    comment: 'Unique active members in last 24 hours'
  },
  activeMembers7d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'active_members_7d'
  },
  postsCount24h: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'posts_count_24h',
    comment: 'Posts created in last 24 hours'
  },
  postsCount7d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'posts_count_7d'
  },
  eventsCount7d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'events_count_7d',
    comment: 'Events created in last 7 days'
  },
  upcomingEventsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'upcoming_events_count',
    comment: 'Number of upcoming events'
  },
  // Engagement metrics
  interactionsCount24h: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'interactions_count_24h',
    comment: 'Total interactions (likes, comments, shares) in 24h'
  },
  interactionsCount7d: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'interactions_count_7d'
  },
  avgEngagementRate: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'avg_engagement_rate',
    comment: 'Average engagement rate (interactions / members)'
  },
  // Trending score
  trendingScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'trending_score',
    comment: 'Calculated trending score (0-100)'
  },
  trendingRank: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'trending_rank',
    comment: 'Global trending rank'
  },
  categoryRank: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'category_rank',
    comment: 'Rank within group category'
  },
  // Velocity metrics (rate of change)
  growthVelocity: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'growth_velocity',
    comment: 'Rate of member growth (percentage change)'
  },
  activityVelocity: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'activity_velocity',
    comment: 'Rate of activity increase'
  },
  // Quality metrics
  qualityScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'quality_score',
    comment: 'Content quality score (0-100)'
  },
  moderationScore: {
    type: DataTypes.FLOAT,
    defaultValue: 100.0,
    field: 'moderation_score',
    comment: 'Moderation health score (100 = no issues)'
  },
  // Timestamps
  lastActivityAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'last_activity_at',
    comment: 'Timestamp of last group activity'
  },
  lastCalculatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'last_calculated_at',
    comment: 'When stats were last calculated'
  },
  createdAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: () => Date.now(),
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'GroupTrendingStats',
  tableName: 'group_trending_stats',
  timestamps: false,
  indexes: [
    { fields: ['group_id'], unique: true },
    { fields: ['trending_score'] },
    { fields: ['trending_rank'] },
    { fields: ['category_rank'] },
    { fields: ['member_growth_24h'] },
    { fields: ['active_members_24h'] },
    { fields: ['growth_velocity'] },
    { fields: ['last_activity_at'] },
    { fields: ['last_calculated_at'] }
  ]
});

module.exports = GroupTrendingStats;
