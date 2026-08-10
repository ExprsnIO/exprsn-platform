/**
 * ═══════════════════════════════════════════════════════════
 * Appeal Model
 * User appeals of moderation decisions and account actions
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Appeal = sequelize.define('Appeal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Appeal target (either moderation item or user action, not both)
    moderationItemId: {
      type: DataTypes.UUID,
      field: 'moderation_item_id',
      references: {
        model: 'moderation_items',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    userActionId: {
      type: DataTypes.UUID,
      field: 'user_action_id',
      references: {
        model: 'user_actions',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    // Appellant
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    additionalInfo: {
      type: DataTypes.TEXT,
      field: 'additional_info'
    },

    // Status
    status: {
      type: DataTypes.ENUM('pending', 'reviewing', 'approved', 'denied'),
      allowNull: false,
      defaultValue: 'pending'
    },

    // Review
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
    decision: {
      type: DataTypes.TEXT
    },

    // Timestamps
    submittedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'submitted_at'
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
    tableName: 'appeals',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['submitted_at'] }
    ],
    validate: {
      eitherModerationOrUserAction() {
        if (
          (this.moderationItemId && this.userActionId) ||
          (!this.moderationItemId && !this.userActionId)
        ) {
          throw new Error('Appeal must target either a moderation item or user action, not both or neither');
        }
      }
    }
  });

  // Instance methods
  Appeal.prototype.approve = async function(moderatorId, notes) {
    this.status = 'approved';
    this.reviewedBy = moderatorId;
    this.reviewedAt = Date.now();
    this.reviewNotes = notes;
    this.decision = 'Appeal approved';
    await this.save();
  };

  Appeal.prototype.deny = async function(moderatorId, notes) {
    this.status = 'denied';
    this.reviewedBy = moderatorId;
    this.reviewedAt = Date.now();
    this.reviewNotes = notes;
    this.decision = 'Appeal denied';
    await this.save();
  };

  // Class methods
  Appeal.associate = function(models) {
    Appeal.belongsTo(models.ModerationCase, {
      foreignKey: 'moderationItemId',
      as: 'moderationItem'
    });

    Appeal.belongsTo(models.UserAction, {
      foreignKey: 'userActionId',
      as: 'userAction'
    });
  };

  return Appeal;
};
