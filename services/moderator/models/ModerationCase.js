/**
 * ═══════════════════════════════════════════════════════════
 * ModerationCase Model (aka moderation_items table)
 * Content items submitted for moderation analysis
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModerationCase = sequelize.define('ModerationCase', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Content identification
    contentType: {
      type: DataTypes.ENUM(
        'text', 'image', 'video', 'audio',
        'post', 'comment', 'message', 'profile', 'file'
      ),
      allowNull: false,
      field: 'content_type'
    },
    contentId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'content_id'
    },
    sourceService: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'source_service'
    },

    // User information
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },

    // Content data
    contentText: {
      type: DataTypes.TEXT,
      field: 'content_text'
    },
    contentUrl: {
      type: DataTypes.TEXT,
      field: 'content_url'
    },
    contentMetadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'content_metadata'
    },

    // Moderation scores
    riskScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'risk_score'
    },
    riskLevel: {
      type: DataTypes.ENUM('safe', 'low', 'medium', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'safe',
      field: 'risk_level'
    },

    // Individual scores
    toxicityScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'toxicity_score'
    },
    nsfwScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'nsfw_score'
    },
    spamScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'spam_score'
    },
    violenceScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'violence_score'
    },
    hateSpeechScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      field: 'hate_speech_score'
    },

    // AI provider used
    aiProvider: {
      type: DataTypes.ENUM('claude', 'openai', 'deepseek', 'local'),
      field: 'ai_provider'
    },
    aiModel: {
      type: DataTypes.STRING(100),
      field: 'ai_model'
    },
    aiResponse: {
      type: DataTypes.JSONB,
      field: 'ai_response'
    },

    // Status and actions
    status: {
      type: DataTypes.ENUM(
        'pending', 'approved', 'rejected',
        'flagged', 'reviewing', 'appealed', 'escalated'
      ),
      allowNull: false,
      defaultValue: 'pending'
    },
    action: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      )
    },

    // Review information
    requiresReview: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'requires_review'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      field: 'reviewed_by'
    },
    reviewedAt: {
      type: DataTypes.BIGINT,
      field: 'reviewed_at'
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      field: 'review_notes'
    },

    // Timestamps
    submittedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'submitted_at'
    },
    processedAt: {
      type: DataTypes.BIGINT,
      field: 'processed_at'
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
    tableName: 'moderation_items',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['risk_level', 'risk_score'] },
      { fields: ['source_service'] },
      { fields: ['submitted_at'] },
      {
        fields: ['requires_review'],
        where: { requires_review: true }
      },
      {
        unique: true,
        fields: ['source_service', 'content_type', 'content_id']
      }
    ]
  });

  // Instance methods
  ModerationCase.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());

    return {
      id: values.id,
      contentType: values.contentType,
      contentId: values.contentId,
      sourceService: values.sourceService,
      userId: values.userId,
      contentText: values.contentText,
      contentUrl: values.contentUrl,
      contentMetadata: values.contentMetadata,
      riskScore: values.riskScore,
      riskLevel: values.riskLevel,
      scores: {
        toxicity: values.toxicityScore,
        nsfw: values.nsfwScore,
        spam: values.spamScore,
        violence: values.violenceScore,
        hateSpeech: values.hateSpeechScore
      },
      aiProvider: values.aiProvider,
      aiModel: values.aiModel,
      status: values.status,
      action: values.action,
      requiresReview: values.requiresReview,
      reviewedBy: values.reviewedBy,
      reviewedAt: values.reviewedAt,
      reviewNotes: values.reviewNotes,
      submittedAt: values.submittedAt,
      processedAt: values.processedAt,
      createdAt: values.createdAt,
      updatedAt: values.updatedAt
    };
  };

  // Class methods
  ModerationCase.associate = function(models) {
    ModerationCase.hasMany(models.ReviewQueue, {
      foreignKey: 'moderationItemId',
      as: 'reviewQueue'
    });

    ModerationCase.hasMany(models.ModerationAction, {
      foreignKey: 'moderationItemId',
      as: 'actions'
    });

    ModerationCase.hasMany(models.Appeal, {
      foreignKey: 'moderationItemId',
      as: 'appeals'
    });
  };

  return ModerationCase;
};
