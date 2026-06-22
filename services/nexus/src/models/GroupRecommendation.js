const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * GroupRecommendation Model
 *
 * Stores personalized group recommendations for users.
 * Recommendations are generated based on:
 * - User interests and activity
 * - Similar groups they're in
 * - Trending groups in their categories
 * - Friend/connection activity
 */
class GroupRecommendation extends Model {}

GroupRecommendation.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    comment: 'User receiving the recommendation'
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'group_id',
    references: {
      model: 'groups',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // Recommendation scoring
  score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
    comment: 'Overall recommendation score (0-100)'
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Rank in user\'s recommendation list'
  },
  // Score components
  categoryMatchScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'category_match_score',
    comment: 'How well category matches user interests'
  },
  tagsMatchScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'tags_match_score',
    comment: 'How well tags match user interests'
  },
  similarGroupsScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'similar_groups_score',
    comment: 'Score based on similarity to user\'s current groups'
  },
  trendingScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'trending_score',
    comment: 'Group\'s trending score'
  },
  socialScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'social_score',
    comment: 'Score based on friends/connections in group'
  },
  activityScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'activity_score',
    comment: 'Group activity level score'
  },
  // Recommendation reasoning
  reasons: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    comment: 'Array of reason codes (e.g., "trending", "friends-joined", "similar-interests")'
  },
  reasonsText: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'reasons_text',
    comment: 'Human-readable reasons for recommendation'
  },
  // User interaction tracking
  wasShown: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'was_shown',
    comment: 'Whether recommendation was shown to user'
  },
  wasClicked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'was_clicked',
    comment: 'Whether user clicked on recommendation'
  },
  wasJoined: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'was_joined',
    comment: 'Whether user joined the group from this recommendation'
  },
  wasDismissed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'was_dismissed',
    comment: 'Whether user dismissed this recommendation'
  },
  dismissReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'dismiss_reason',
    comment: 'Reason for dismissal (not-interested, already-member, etc.)'
  },
  // Timestamps
  shownAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'shown_at'
  },
  clickedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'clicked_at'
  },
  joinedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'joined_at'
  },
  dismissedAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'dismissed_at'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'expires_at',
    comment: 'When recommendation should be refreshed'
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
  },
  // Metadata
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional recommendation metadata'
  }
}, {
  sequelize,
  modelName: 'GroupRecommendation',
  tableName: 'group_recommendations',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['group_id'] },
    { fields: ['user_id', 'group_id'], unique: true },
    { fields: ['user_id', 'score'] },
    { fields: ['user_id', 'rank'] },
    { fields: ['was_shown'] },
    { fields: ['was_clicked'] },
    { fields: ['was_joined'] },
    { fields: ['was_dismissed'] },
    { fields: ['expires_at'] },
    { fields: ['created_at'] }
  ]
});

module.exports = GroupRecommendation;
