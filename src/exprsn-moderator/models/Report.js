/**
 * ═══════════════════════════════════════════════════════════
 * Report Model
 * User-submitted content reports
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // Report information
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

    // Reporter information
    reportedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reported_by'
    },
    reason: {
      type: DataTypes.ENUM(
        'spam', 'harassment', 'hate_speech', 'violence',
        'nsfw', 'misinformation', 'copyright', 'personal_info', 'other'
      ),
      allowNull: false
    },
    details: {
      type: DataTypes.TEXT
    },

    // Status
    status: {
      type: DataTypes.ENUM('open', 'investigating', 'resolved', 'dismissed', 'escalated'),
      allowNull: false,
      defaultValue: 'open'
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

    // Resolution
    resolvedBy: {
      type: DataTypes.UUID,
      field: 'resolved_by'
    },
    resolvedAt: {
      type: DataTypes.BIGINT,
      field: 'resolved_at'
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      field: 'resolution_notes'
    },
    actionTaken: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      ),
      field: 'action_taken'
    },

    // Timestamps
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
    tableName: 'reports',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['reported_by'] },
      { fields: ['source_service', 'content_type', 'content_id'] },
      {
        fields: ['assigned_to'],
        where: { assigned_to: { $ne: null } }
      },
      { fields: ['created_at'] }
    ]
  });

  // Instance methods
  Report.prototype.assign = async function(moderatorId) {
    this.assignedTo = moderatorId;
    this.assignedAt = Date.now();
    this.status = 'investigating';
    await this.save();
  };

  Report.prototype.resolve = async function(moderatorId, action, notes) {
    this.resolvedBy = moderatorId;
    this.resolvedAt = Date.now();
    this.resolutionNotes = notes;
    this.actionTaken = action;
    this.status = 'resolved';
    await this.save();
  };

  // Class methods
  Report.associate = function(models) {
    Report.hasMany(models.ModerationAction, {
      foreignKey: 'reportId',
      as: 'actions'
    });
  };

  return Report;
};
