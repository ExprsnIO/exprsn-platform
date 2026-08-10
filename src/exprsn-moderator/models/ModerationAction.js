/**
 * ═══════════════════════════════════════════════════════════
 * ModerationAction Model
 * Audit trail of all moderation actions taken
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ModerationAction = sequelize.define('ModerationAction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Action details
    action: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      ),
      allowNull: false
    },
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

    // Actor
    performedBy: {
      type: DataTypes.UUID,
      field: 'performed_by'
    },
    isAutomated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_automated'
    },

    // Context
    reason: {
      type: DataTypes.TEXT
    },
    moderationItemId: {
      type: DataTypes.UUID,
      field: 'moderation_item_id',
      references: {
        model: 'moderation_items',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    reportId: {
      type: DataTypes.UUID,
      field: 'report_id',
      references: {
        model: 'reports',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },

    // Timestamp
    performedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'performed_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'moderation_actions',
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ['source_service', 'content_type', 'content_id'] },
      { fields: ['performed_at'] },
      {
        fields: ['performed_by'],
        where: { performed_by: { $ne: null } }
      },
      { fields: ['is_automated'] }
    ]
  });

  // Class methods
  ModerationAction.associate = function(models) {
    ModerationAction.belongsTo(models.ModerationCase, {
      foreignKey: 'moderationItemId',
      as: 'moderationItem'
    });

    ModerationAction.belongsTo(models.Report, {
      foreignKey: 'reportId',
      as: 'report'
    });
  };

  return ModerationAction;
};
