/**
 * ═══════════════════════════════════════════════════════════
 * ModerationRule Model
 * Custom moderation rules and policies
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModerationRule = sequelize.define('ModerationRule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Rule identification
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT
    },

    // Rule scope
    appliesTo: {
      type: DataTypes.ARRAY(DataTypes.ENUM(
        'text', 'image', 'video', 'audio',
        'post', 'comment', 'message', 'profile', 'file'
      )),
      field: 'applies_to'
    },
    sourceServices: {
      type: DataTypes.ARRAY(DataTypes.STRING(100)),
      field: 'source_services'
    },

    // Rule configuration
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    thresholdScore: {
      type: DataTypes.INTEGER,
      field: 'threshold_score'
    },
    action: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      ),
      allowNull: false
    },

    // Status
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    // Metadata
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by'
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'moderation_rules',
    timestamps: true,
    underscored: true
  });

  // Instance methods
  ModerationRule.prototype.evaluate = function(moderationCase) {
    // Check if rule applies to content type
    if (this.appliesTo && !this.appliesTo.includes(moderationCase.contentType)) {
      return null;
    }

    // Check if rule applies to source service
    if (this.sourceServices && !this.sourceServices.includes(moderationCase.sourceService)) {
      return null;
    }

    // Check threshold
    if (this.thresholdScore !== null && moderationCase.riskScore < this.thresholdScore) {
      return null;
    }

    // Rule applies
    return this.action;
  };

  return ModerationRule;
};
