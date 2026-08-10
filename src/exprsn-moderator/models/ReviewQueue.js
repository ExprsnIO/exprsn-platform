/**
 * ═══════════════════════════════════════════════════════════
 * ReviewQueue Model
 * Items queued for manual moderator review
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReviewQueue = sequelize.define('ReviewQueue', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Content reference
    moderationItemId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'moderation_item_id',
      references: {
        model: 'moderation_items',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },

    // Queue information
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    escalated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    escalatedReason: {
      type: DataTypes.TEXT,
      field: 'escalated_reason'
    },

    // Assignment
    assignedTo: {
      type: DataTypes.UUID,
      field: 'assigned_to'
    },
    assignedAt: {
      type: DataTypes.BIGINT,
      field: 'assigned_at'
    },

    // Status
    status: {
      type: DataTypes.ENUM(
        'pending', 'approved', 'rejected',
        'flagged', 'reviewing', 'appealed', 'escalated'
      ),
      allowNull: false,
      defaultValue: 'pending'
    },

    // Timestamps
    queuedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'queued_at'
    },
    completedAt: {
      type: DataTypes.BIGINT,
      field: 'completed_at'
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
    tableName: 'review_queue',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['priority', 'queued_at'] },
      {
        fields: ['assigned_to'],
        where: { assigned_to: { $ne: null } }
      },
      {
        fields: ['escalated'],
        where: { escalated: true }
      }
    ]
  });

  // Instance methods
  ReviewQueue.prototype.claim = async function(moderatorId) {
    this.assignedTo = moderatorId;
    this.assignedAt = Date.now();
    this.status = 'reviewing';
    await this.save();
  };

  ReviewQueue.prototype.complete = async function(decision) {
    this.status = decision;
    this.completedAt = Date.now();
    await this.save();
  };

  // Class methods
  ReviewQueue.associate = function(models) {
    ReviewQueue.belongsTo(models.ModerationCase, {
      foreignKey: 'moderationItemId',
      as: 'moderationItem'
    });
  };

  return ReviewQueue;
};
