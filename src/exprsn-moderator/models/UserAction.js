/**
 * ═══════════════════════════════════════════════════════════
 * UserAction Model
 * Disciplinary actions taken against user accounts
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserAction = sequelize.define('UserAction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // User and action
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    actionType: {
      type: DataTypes.ENUM('warn', 'suspend', 'ban', 'restrict', 'unsuspend', 'unban'),
      allowNull: false,
      field: 'action_type'
    },

    // Details
    reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      field: 'duration_seconds'
    },
    expiresAt: {
      type: DataTypes.BIGINT,
      field: 'expires_at'
    },

    // Context
    performedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'performed_by'
    },
    relatedContentId: {
      type: DataTypes.STRING(255),
      field: 'related_content_id'
    },
    relatedReportId: {
      type: DataTypes.UUID,
      field: 'related_report_id',
      references: {
        model: 'reports',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },

    // Status
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    revokedBy: {
      type: DataTypes.UUID,
      field: 'revoked_by'
    },
    revokedAt: {
      type: DataTypes.BIGINT,
      field: 'revoked_at'
    },
    revokeReason: {
      type: DataTypes.TEXT,
      field: 'revoke_reason'
    },

    // Timestamps
    performedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'performed_at'
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
    tableName: 'user_actions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      {
        fields: ['active'],
        where: { active: true }
      },
      {
        fields: ['expires_at'],
        where: { expires_at: { $ne: null } }
      },
      { fields: ['action_type'] }
    ]
  });

  // Instance methods
  UserAction.prototype.isExpired = function() {
    if (!this.expiresAt) return false;
    return Date.now() > this.expiresAt;
  };

  UserAction.prototype.revoke = async function(moderatorId, reason) {
    this.active = false;
    this.revokedBy = moderatorId;
    this.revokedAt = Date.now();
    this.revokeReason = reason;
    await this.save();
  };

  // Class methods
  UserAction.associate = function(models) {
    UserAction.belongsTo(models.Report, {
      foreignKey: 'relatedReportId',
      as: 'report'
    });

    UserAction.hasMany(models.Appeal, {
      foreignKey: 'userActionId',
      as: 'appeals'
    });
  };

  // Get active actions for a user
  UserAction.getActiveForUser = async function(userId) {
    const now = Date.now();
    return await this.findAll({
      where: {
        userId,
        active: true,
        [sequelize.Sequelize.Op.or]: [
          { expiresAt: null },
          { expiresAt: { [sequelize.Sequelize.Op.gt]: now } }
        ]
      },
      order: [['performedAt', 'DESC']]
    });
  };

  return UserAction;
};
