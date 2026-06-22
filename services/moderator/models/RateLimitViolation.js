/**
 * ═══════════════════════════════════════════════════════════
 * Rate Limit Violation Model
 * Track rate limit and spam violations
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RateLimitViolation = sequelize.define('RateLimitViolation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    violationType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'violation_type'
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false
    },
    endpoint: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    requestCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'request_count'
    },
    limitThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'limit_threshold'
    },
    windowSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'window_seconds'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    details: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('details');
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
    },
    actionTaken: {
      type: DataTypes.ENUM(
        'auto_approve', 'approve', 'reject', 'hide',
        'remove', 'warn', 'flag', 'escalate', 'require_review'
      ),
      allowNull: true,
      field: 'action_taken'
    },
    autoResolved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'auto_resolved'
    },
    resolvedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'resolved_at'
    },
    detectedAt: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'detected_at'
    }
  }, {
    tableName: 'rate_limit_violations',
    underscored: true,
    timestamps: true,
    updatedAt: false
  });

  // Instance methods
  RateLimitViolation.prototype.resolve = async function() {
    this.autoResolved = true;
    this.resolvedAt = Date.now();
    await this.save();
  };

  RateLimitViolation.prototype.isActive = function() {
    return !this.autoResolved && !this.resolvedAt;
  };

  // Class methods
  RateLimitViolation.getActiveViolations = async function(userId) {
    return await this.findAll({
      where: {
        userId,
        autoResolved: false
      },
      order: [['detectedAt', 'DESC']]
    });
  };

  RateLimitViolation.getSeverityCount = async function(userId, severity) {
    return await this.count({
      where: {
        userId,
        severity,
        autoResolved: false
      }
    });
  };

  return RateLimitViolation;
};
